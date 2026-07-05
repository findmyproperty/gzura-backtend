import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type NominatimAddress = {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
};

type PhotonProperties = {
  name?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
};

type PhotonFeature = {
  properties?: PhotonProperties;
  geometry?: { coordinates?: [number, number] };
};

type GooglePlaceResult = {
  formatted_address?: string;
  name?: string;
  geometry?: {
    location?: { lat: number; lng: number };
  };
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  address_components?: { long_name: string; types: string[] }[];
  geometry?: {
    location?: { lat: number; lng: number };
  };
};

export type GeocodingResult = {
  displayName: string;
  latitude: number;
  longitude: number;
  venue: string;
  source: 'google' | 'nominatim' | 'photon';
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly nominatimUrl = 'https://nominatim.openstreetmap.org';
  private readonly photonUrl = 'https://photon.komoot.io/api';

  constructor(private readonly config: ConfigService) {}

  private getGoogleApiKey() {
    return (
      this.config.get<string>('GOOGLE_MAPS_API_KEY') ||
      this.config.get<string>('GOOGLE_PLACES_API_KEY') ||
      ''
    );
  }

  private hasGoogleMaps() {
    return !!this.getGoogleApiKey();
  }

  private async fetchJson(url: string, userAgent = true) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(userAgent
          ? { 'User-Agent': 'GZURA-Events/1.0 (contact@gzura.com)' }
          : {}),
      },
    });

    if (!response.ok) {
      this.logger.warn(`Geocoding request failed: ${response.status} ${url}`);
      throw new Error('Location lookup failed');
    }

    return response.json();
  }

  private mapGooglePlace(place: GooglePlaceResult): GeocodingResult | null {
    const lat = place.geometry?.location?.lat;
    const lng = place.geometry?.location?.lng;
    if (lat == null || lng == null) return null;

    return {
      displayName: place.formatted_address || place.name || 'Selected location',
      latitude: lat,
      longitude: lng,
      venue: place.name || '',
      source: 'google',
    };
  }

  private mapNominatimResult(item: {
    display_name: string;
    lat: string;
    lon: string;
    address?: NominatimAddress;
  }): GeocodingResult {
    const address = item.address;
    const venue =
      address?.road ||
      address?.neighbourhood ||
      address?.suburb ||
      address?.city ||
      address?.town ||
      address?.village ||
      '';

    return {
      displayName: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      venue,
      source: 'nominatim',
    };
  }

  private mapPhotonResult(feature: PhotonFeature): GeocodingResult | null {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!coords || !props) return null;

    const [longitude, latitude] = coords;
    const displayName = [
      props.name,
      props.street,
      props.locality || props.district,
      props.city,
      props.state,
      props.country,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      displayName: displayName || props.name || 'Selected location',
      latitude,
      longitude,
      venue: props.name || props.street || '',
      source: 'photon',
    };
  }

  private async searchGoogle(
    query: string,
    limit: number,
    options?: { lat?: number; lon?: number },
  ) {
    const apiKey = this.getGoogleApiKey();
    if (!apiKey) return [];

    const params = new URLSearchParams({
      query,
      key: apiKey,
    });

    if (options?.lat != null && options?.lon != null) {
      params.set('location', `${options.lat},${options.lon}`);
      params.set('radius', '50000');
    }

    const data = await this.fetchJson(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
      false,
    );

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      this.logger.warn(`Google Places search failed: ${data.status}`);
      return [];
    }

    const results = Array.isArray(data.results) ? data.results : [];
    return results
      .slice(0, limit)
      .map((place: GooglePlaceResult) => this.mapGooglePlace(place))
      .filter((result: GeocodingResult | null): result is GeocodingResult => !!result);
  }

  private async reverseGoogle(latitude: number, longitude: number) {
    const apiKey = this.getGoogleApiKey();
    if (!apiKey) return null;

    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: apiKey,
    });

    const data = await this.fetchJson(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      false,
    );

    if (data.status !== 'OK' || !Array.isArray(data.results) || !data.results[0]) {
      this.logger.warn(`Google reverse geocode failed: ${data.status}`);
      return null;
    }

    const result = data.results[0] as GoogleGeocodeResult;
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    if (lat == null || lng == null) return null;

    const venue =
      result.address_components?.find((component) =>
        component.types.includes('establishment'),
      )?.long_name ||
      result.address_components?.find((component) =>
        component.types.includes('point_of_interest'),
      )?.long_name ||
      '';

    return {
      displayName: result.formatted_address || 'Selected location',
      latitude: lat,
      longitude: lng,
      venue,
      source: 'google' as const,
    };
  }

  private async searchNominatim(query: string, limit: number) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      limit: String(limit),
      addressdetails: '1',
      countrycodes: 'in',
    });

    const results = await this.fetchJson(
      `${this.nominatimUrl}/search?${params.toString()}`,
    );

    if (!Array.isArray(results)) return [];
    return results.map((item) => this.mapNominatimResult(item));
  }

  private async searchPhoton(
    query: string,
    limit: number,
    options?: { lat?: number; lon?: number },
  ) {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      lang: 'en',
    });

    if (options?.lat != null && options?.lon != null) {
      params.set('lat', String(options.lat));
      params.set('lon', String(options.lon));
    }

    const data = await this.fetchJson(`${this.photonUrl}/?${params.toString()}`, false);
    const features = Array.isArray(data?.features) ? data.features : [];

    return features
      .map((feature: PhotonFeature) => this.mapPhotonResult(feature))
      .filter((result: GeocodingResult | null): result is GeocodingResult => !!result);
  }

  private dedupeResults(results: GeocodingResult[]) {
    const seen = new Set<string>();
    return results.filter((result) => {
      const key = `${result.latitude.toFixed(5)}:${result.longitude.toFixed(5)}:${result.displayName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async search(
    query: string,
    limit = 5,
    options?: { lat?: number; lon?: number },
  ): Promise<GeocodingResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const parsedLimit = Math.min(Math.max(limit, 1), 10);

    if (this.hasGoogleMaps()) {
      const googleResults = await this.searchGoogle(trimmed, parsedLimit, options);
      if (googleResults.length > 0) {
        return googleResults;
      }
    }

    const settled = await Promise.allSettled([
      this.searchPhoton(trimmed, parsedLimit, options),
      this.searchNominatim(trimmed, parsedLimit),
    ]);

    const combined = settled.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );

    return this.dedupeResults(combined).slice(0, parsedLimit);
  }

  async reverse(latitude: number, longitude: number): Promise<GeocodingResult> {
    if (this.hasGoogleMaps()) {
      const googleResult = await this.reverseGoogle(latitude, longitude);
      if (googleResult) return googleResult;
    }

    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      addressdetails: '1',
    });

    const result = await this.fetchJson(
      `${this.nominatimUrl}/reverse?${params.toString()}`,
    );

    return this.mapNominatimResult(result);
  }
}