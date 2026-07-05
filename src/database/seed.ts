import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { EventStatus } from '../common/enums/event-status.enum';
import { Role } from '../common/enums/role.enum';
import { ContactSubmission } from '../entities/contact-submission.entity';
import { EventRegistration } from '../entities/event-registration.entity';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';

config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [User, Event, EventRegistration, ContactSubmission],
  synchronize: false,
});

async function seed() {
  await dataSource.initialize();
  await dataSource.synchronize();
  console.log('Database schema synced.');

  const userRepo = dataSource.getRepository(User);
  const eventRepo = dataSource.getRepository(Event);

  const accounts = [
    {
      email: 'admin@gzura.com',
      password: 'Admin@123',
      firstName: 'GZURA',
      lastName: 'Admin',
      role: Role.ADMIN,
      phone: null,
      city: null,
      profession: null,
    },
    {
      email: 'angela@gzura.com',
      password: 'Host@123',
      firstName: 'Dr. Angela',
      lastName: 'Okonkwo',
      role: Role.HOST,
      phone: '+91 9000000001',
      city: 'Mumbai',
      profession: 'Leadership strategist',
    },
    {
      email: 'michael@gzura.com',
      password: 'Host@123',
      firstName: 'Michael',
      lastName: 'Chen',
      role: Role.HOST,
      phone: '+91 9000000002',
      city: 'Bengaluru',
      profession: 'Startup mentor',
    },
    {
      email: 'priya@gzura.com',
      password: 'Host@123',
      firstName: 'Priya',
      lastName: 'Sharma',
      role: Role.HOST,
      phone: '+91 9000000003',
      city: 'Delhi',
      profession: 'Community builder',
    },
    {
      email: 'user@gzura.com',
      password: 'User@123',
      firstName: 'John',
      lastName: 'Member',
      role: Role.MEMBER,
      phone: '+91 9876543210',
      city: 'Bengaluru',
      profession: 'Entrepreneur',
    },
  ];

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    const existing = await userRepo.findOne({ where: { email: account.email } });

    if (existing) {
      existing.passwordHash = passwordHash;
      existing.firstName = account.firstName;
      existing.lastName = account.lastName;
      existing.role = account.role;
      existing.phone = account.phone;
      existing.city = account.city;
      existing.profession = account.profession;
      await userRepo.save(existing);
      console.log(`Updated ${account.role}: ${account.email}`);
    } else {
      await userRepo.save(
        userRepo.create({
          email: account.email,
          passwordHash,
          firstName: account.firstName,
          lastName: account.lastName,
          role: account.role,
          phone: account.phone,
          city: account.city,
          profession: account.profession,
        }),
      );
      console.log(`Created ${account.role}: ${account.email}`);
    }
  }

  const events = [
    {
      title: 'Leadership Summit 2026',
      slug: 'leadership-summit-2026',
      description:
        'Our annual flagship event featuring world-class speakers, workshops, and networking opportunities.',
      type: 'Offline',
      dateStart: new Date('2026-03-15'),
      dateEnd: new Date('2026-03-17'),
      timeLabel: '9:00 AM - 6:00 PM',
      location: 'Grand Convention Center, Downtown',
      venue: 'Grand Convention Center',
      speakerName: 'Dr. Angela Okonkwo',
      speakerBio: 'Founder & CEO with 20+ years in leadership development.',
      courseOutline:
        '1. Opening keynote on modern leadership\n2. Interactive workshops and peer discussions\n3. Closing strategy roundtable',
      imageUrl:
        'https://images.pexels.com/photos/2774556/pexels-photo-2774556.jpeg?auto=compress&cs=tinysrgb&w=800',
      price: 299,
      memberPrice: 199,
      maxAttendees: 500,
      featured: true,
      status: EventStatus.PUBLISHED,
    },
    {
      title: 'Entrepreneurship Bootcamp',
      slug: 'entrepreneurship-bootcamp-2026',
      description:
        'Intensive 2-day workshop covering all aspects of starting and scaling a business.',
      type: 'Offline',
      dateStart: new Date('2026-03-22'),
      dateEnd: new Date('2026-03-23'),
      timeLabel: '10:00 AM - 5:00 PM',
      location: 'Innovation Hub',
      venue: 'Innovation Hub',
      speakerName: 'Michael Chen',
      speakerBio: 'Serial entrepreneur with 3 successful venture exits.',
      courseOutline:
        '1. Validate your idea\n2. Build a lean launch plan\n3. Scale with systems and feedback',
      imageUrl:
        'https://images.pexels.com/photos/3184325/pexels-photo-3184325.jpeg?auto=compress&cs=tinysrgb&w=800',
      price: 149,
      memberPrice: 99,
      maxAttendees: 50,
      featured: false,
      status: EventStatus.PUBLISHED,
    },
    {
      title: 'Women in Leadership Mixer',
      slug: 'women-leadership-mixer-2026',
      description:
        'Connect with inspiring women leaders and share experiences in a supportive environment.',
      type: 'Online',
      dateStart: new Date('2026-03-28'),
      timeLabel: '6:00 PM - 9:00 PM',
      location: 'Google Meet',
      venue: null,
      meetingRoomId: 'https://meet.google.com/gzr-women-leadership',
      speakerName: 'Priya Sharma',
      speakerBio: 'Community builder and networking expert.',
      courseOutline:
        '1. Welcome and introductions\n2. Panel discussion with women leaders\n3. Networking circle and Q&A',
      imageUrl:
        'https://images.pexels.com/photos/1181533/pexels-photo-1181533.jpeg?auto=compress&cs=tinysrgb&w=800',
      price: 0,
      memberPrice: 0,
      maxAttendees: 100,
      featured: false,
      status: EventStatus.PUBLISHED,
    },
  ];

  for (const eventData of events) {
    const existing = await eventRepo.findOne({ where: { slug: eventData.slug } });
    if (existing) {
      Object.assign(existing, eventData);
      await eventRepo.save(existing);
    } else {
      await eventRepo.save(eventRepo.create(eventData));
    }
  }

  console.log('\nLogin credentials:');
  console.log('  Admin:  admin@gzura.com  / Admin@123  → /login → /admin');
  console.log('  Member: user@gzura.com   / User@123   → /login → /dashboard');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
