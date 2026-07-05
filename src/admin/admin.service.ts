import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { EventStatus } from '../common/enums/event-status.enum';
import { Role } from '../common/enums/role.enum';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(EventRegistration)
    private registrationRepo: Repository<EventRegistration>,
  ) {}

  private formatMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
      month: 'short',
      year: '2-digit',
    });
  }

  private getLastSixMonths() {
    const months: string[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(key);
    }

    return months;
  }

  async getDashboardStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      ongoingEvents,
      registeredUsers,
      totalRegistrations,
      newRegistrations,
      revenueRow,
      registrationsByMonthRaw,
      revenueByMonthRaw,
      topEventsRaw,
    ] = await Promise.all([
      this.eventRepo
        .createQueryBuilder('event')
        .where('event.status = :status', { status: EventStatus.PUBLISHED })
        .andWhere(
          '(event.dateEnd IS NOT NULL AND event.dateEnd >= :now) OR (event.dateEnd IS NULL AND event.dateStart >= :now)',
          { now },
        )
        .getCount(),

      this.userRepo.count({ where: { role: Role.MEMBER } }),

      this.registrationRepo.count(),

      this.registrationRepo.count({
        where: { createdAt: MoreThan(thirtyDaysAgo) },
      }),

      this.registrationRepo
        .createQueryBuilder('registration')
        .innerJoin('registration.event', 'event')
        .select('COALESCE(SUM(event.price), 0)', 'total')
        .getRawOne<{ total: string }>(),

      this.registrationRepo
        .createQueryBuilder('registration')
        .select("DATE_FORMAT(registration.createdAt, '%Y-%m')", 'month')
        .addSelect('COUNT(registration.id)', 'count')
        .where('registration.createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)')
        .groupBy('month')
        .orderBy('month', 'ASC')
        .getRawMany<{ month: string; count: string }>(),

      this.registrationRepo
        .createQueryBuilder('registration')
        .innerJoin('registration.event', 'event')
        .select("DATE_FORMAT(registration.createdAt, '%Y-%m')", 'month')
        .addSelect('COALESCE(SUM(event.price), 0)', 'revenue')
        .where('registration.createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)')
        .groupBy('month')
        .orderBy('month', 'ASC')
        .getRawMany<{ month: string; revenue: string }>(),

      this.registrationRepo
        .createQueryBuilder('registration')
        .innerJoin('registration.event', 'event')
        .select('event.title', 'title')
        .addSelect('COUNT(registration.id)', 'registrations')
        .groupBy('event.id')
        .addGroupBy('event.title')
        .orderBy('registrations', 'DESC')
        .limit(6)
        .getRawMany<{ title: string; registrations: string }>(),
    ]);

    const registrationCountByMonth = new Map(
      registrationsByMonthRaw.map((row) => [row.month, Number(row.count)]),
    );
    const revenueByMonthMap = new Map(
      revenueByMonthRaw.map((row) => [row.month, Number(row.revenue)]),
    );

    const months = this.getLastSixMonths();

    return {
      totals: {
        ongoingEvents,
        registeredUsers,
        totalRevenue: Number(revenueRow?.total ?? 0),
        newRegistrations,
        totalRegistrations,
      },
      registrationsByMonth: months.map((month) => ({
        month,
        label: this.formatMonthLabel(month),
        count: registrationCountByMonth.get(month) ?? 0,
      })),
      revenueByMonth: months.map((month) => ({
        month,
        label: this.formatMonthLabel(month),
        revenue: revenueByMonthMap.get(month) ?? 0,
      })),
      topEvents: topEventsRaw.map((row) => ({
        title: row.title,
        registrations: Number(row.registrations),
      })),
    };
  }
}