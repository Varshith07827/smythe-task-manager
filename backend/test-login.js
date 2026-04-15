const http = require('http');

const data = JSON.stringify({
  email: 'admin@smythe.local',
  password: 'SmytheDemo123!'
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
        console.log('\n✅ You can now login at http://localhost:5173');
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
