const http = require('http');

const accounts = [
  {
    type: 'admin',
    name: 'Admin User',
    email: 'admin@test.local',
    password: 'admin123'
  },
  {
    type: 'user',
    name: 'Demo User',
    email: 'user@test.local',
    password: 'user123'
  }
];

let created = [];
let count = 0;

async function createAccount(account) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      name: account.name,
      email: account.email,
      password: account.password,
      organizationName: account.type === 'admin' ? 'Test Organization' : undefined
    });

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
            created.push({
              type: account.type,
              name: account.name,
              email: j.user.email,
              password: account.password,
              role: j.user.role
            });
          } else {
            created.push({
              type: account.type,
              email: account.email,
              error: j.error
            });
          }
        } catch (e) {
          created.push({
            type: account.type,
            email: account.email,
            error: 'Parse error'
          });
        }
        resolve();
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('📝 Creating dummy test accounts...\n');

  for (const account of accounts) {
    await createAccount(account);
  }

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║     DUMMY TEST CREDENTIALS                ║');
  console.log('╠═══════════════════════════════════════════╣\n');

  for (const cred of created) {
    if (cred.error) {
      console.log(`❌ ${cred.type.toUpperCase()} - ${cred.email}\n   Error: ${cred.error}\n`);
    } else {
      console.log(`✅ ${cred.type.toUpperCase()} ACCOUNT`);
      console.log(`   Email:    ${cred.email}`);
      console.log(`   Password: ${cred.password}`);
      console.log(`   Role:     ${cred.role}\n`);
    }
  }

  console.log('╠═══════════════════════════════════════════╣');
  console.log('║ 🌐 Login at: http://localhost:5173        ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
