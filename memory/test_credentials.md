# Test Credentials

## Doctor / Test Professional
- Email: sarah@test.com
- Password: test123456
- Demo WA inbox: seeded 3 conversation threads (+919876543210 Rahul Sharma, +918765432109 Priya Patel, +917654321098 Arun Kumar)

## Meta App Review Reviewer (seeded via `backend/seed_reviewer.py`)
- Email: reviewer@lumer.me
- Password: MetaReview@2026
- Role: doctor
- Pre-seeded: 3 demo patients (+919000000001, +919000000002, +919000000003) and 1 appointment "Reviewer Demo" on tomorrow @ 10:00
- Re-run `python /app/backend/seed_reviewer.py` any time to reset password / refresh seeds

## Admin
- Email: admin@lumer.me
- Password: admin123

## Receptionist (sub-user, dynamically created in tests)
- Test format: recep_<timestamp>@test.com / Recep@12345
- Created via POST /api/clinics/sub-users (requires doctor token)
- Role: 'receptionist', linked to parent doctor via parent_user_id

## Polyclinic Admin
- Email: priya@sunrise.clinic
- Password: clinic123
- Polyclinic: "Sunrise Polyclinic"
- Login lands at /polyclinic/dashboard
- Can invite existing doctors by email via POST /api/polyclinic/doctors/invite
