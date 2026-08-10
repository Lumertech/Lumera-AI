# Test Credentials

## Doctor / Test Professional
- Email: sarah@test.com
- Password: test123456

## Admin
- Email: admin@lumer.com
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
