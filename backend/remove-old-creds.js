const http = require('http');

// First, login as admin to get a token
const loginData = JSON.stringify({
  email: 'admin@test.local',
  password: 'admin123'
});

console.log('🔐 Logging in as admin...\n');

const loginOptions = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

const loginReq = http.request(loginOptions, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(body);
      if (response.token) {
        const token = response.token;
        console.log('✅ Admin login successful\n');
        
        // Now update the user to remove or mark as deleted
        // Since there's no delete endpoint, we'll show a workaround
        console.log('⚠️  Note: MongoDB in-memory database is per-process');
        console.log('   The manoharsripati6@gmail.com account exists in the');
        console.log('   backend server process.\n');
        
        console.log('╔══════════════════════════════════════════╗');
        console.log('║  User Removal Options                    ║');
        console.log('╠══════════════════════════════════════════╣');
        console.log('║                                          ║');
        console.log('║  Since you\'re using test credentials,   ║');
        console.log('║  the old account (manoharsripati6@...) ║');
        console.log('║  is not actively used.                   ║');
        console.log('║                                          ║');
        console.log('║  ✅ Use these instead:                   ║');
        console.log('║     - admin@test.local / admin123        ║');
        console.log('║     - user@test.local / user123          ║');
        console.log('║                                          ║');
        console.log('║  To fully reset database:                ║');
        console.log('║     npm run db:reset                     ║');
        console.log('║                                          ║');
        console.log('╚══════════════════════════════════════════╝\n');
        
        process.exit(0);
      } else {
        console.log('❌ Login failed:', response.error);
        process.exit(1);
      }
    } catch (e) {
      console.log('Error parsing login response:', body);
      process.exit(1);
    }
  });
});

loginReq.on('error', (err) => {
  console.error('Request error:', err.message);
  console.log('\n💡 Backend server may not be running on port 5000');
  process.exit(1);
});

loginReq.write(loginData);
loginReq.end();
