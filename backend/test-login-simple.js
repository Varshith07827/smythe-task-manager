const http = require('http');

const data = JSON.stringify({
  email: 'admin@test.local',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
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
        console.log('✅ Login successful!');
        console.log('Token:', j.token.slice(0, 20) + '...');
        console.log('User:', j.user.name, '(' + j.user.role + ')');
      } else {
        console.log('❌ Login failed:', j.error);
      }
    } catch (e) {
      console.log('Response:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(data);
req.end();
