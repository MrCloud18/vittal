const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    console.log('Starting seed process...');
    
    // Clear existing data (optional, be careful)
    // await db.query('TRUNCATE users CASCADE');

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash('password123', salt);

    const totalUsers = 75;
    const totalPatients = 56;
    const totalDoctors = 19;

    const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const specialties = ['Cardiology', 'Internal Medicine', 'Neurology', 'Pediatrics', 'Dermatology', 'Traumatology'];

    function randomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomBirthDate() {
      const year = randomInt(1940, 2010);
      const month = randomInt(1, 12);
      const day = randomInt(1, 28);
      const yyyy = year.toString().padLeft(4, '0');
      const mm = month.toString().padLeft(2, '0');
      const dd = day.toString().padLeft(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    for (let i = 1; i <= totalUsers; i++) {
      const isPatient = i <= totalPatients;
      const role = isPatient ? 'patient' : 'doctor';
      const name = isPatient ? `Patient Test ${i}` : `Doctor Test ${i - totalPatients}`;
      const email = isPatient ? `patient${i}@vittal.com` : `doctor${i - totalPatients}@vittal.com`;
      const isActive = i % 10 !== 0;

      const insertedUser = await db.query(
        'INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING RETURNING id',
        [name, email, passwordHash, role, isActive]
      );

      const userId = insertedUser.rows[0]?.id;
      if (!userId) continue;

      if (isPatient) {
        const dni = (10000000 + i).toString();
        const bloodType = bloodTypes[i % bloodTypes.length];
        const phone = `9${randomInt(10000000, 99999999)}`;
        await db.query(
          'INSERT INTO patients (user_id, full_name, dni, birth_date, blood_type, phone, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (dni) DO NOTHING',
          [userId, name, dni, randomBirthDate(), bloodType, phone, isActive]
        );
      } else {
        const specialty = specialties[i % specialties.length];
        const cmp = `CMP${randomInt(10000, 99999)}`;
        const schedule = 'Mon-Fri 09:00-17:00';
        await db.query(
          'INSERT INTO doctors (user_id, specialty, cmp, schedule) VALUES ($1, $2, $3, $4)',
          [userId, specialty, cmp, schedule]
        );
      }
    }

    console.log(`Successfully seeded ${totalUsers} users (${totalPatients} patients, ${totalDoctors} doctors).`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
