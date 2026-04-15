const http = require('http');

const data = JSON.stringify({
  name: 'Manohar Sripati',
  email: 'manoharsripati6@gmail.com',
  password: 'SmytheDemo123!',
  organizationName: 'Manohar\'s Organization'
});

console.log('📝 Registering admin account...\n');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const j = JSON.parse(body);
      if (j.token) {
        console.log('✅ Account created successfully!\n');
        console.log('╔════════════════════════════════════╗');
        console.log('║  LOGIN CREDENTIALS                 ║');
        console.log('╠════════════════════════════════════╣');
        console.log(`║ Email:    ${j.user.email.padEnd(25)} ║`);
        console.log(`║ Password: ${'SmytheDemo123!'.padEnd(23)} ║`);
        console.log(`║ Role:     ${j.user.role.padEnd(26)} ║`);
        console.log('╠════════════════════════════════════╣');
        console.log('║ Organization: Manohar\'s Organization');
        console.log('╚════════════════════════════════════╝\n');
        console.log('🔐 Token:', j.token.slice(0, 30) + '...\n');
        console.log('✅ You can now login at http://localhost:5173');
      } else {
        console.log('❌ Error:', j.error);
      }
    } catch (e) {
      console.log('Response:', body);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
  process.exit(1);
});

req.write(data);
req.end();
