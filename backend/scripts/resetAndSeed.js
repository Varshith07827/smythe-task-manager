/**
 * Drops the current MongoDB database, seeds a rich set of dummy data for testing.
 * Run from backend/:  npm run db:reset
 *
 * Override passwords: SMYTHE_SEED_PASSWORD=YourPass node scripts/resetAndSeed.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const Organization = require('../models/Organization');
const Board = require('../models/Board');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');

const DEFAULT_PASSWORD = process.env.SMYTHE_SEED_PASSWORD || 'SmytheDemo123!';

/* ── helpers ───────────────────────────────────────────────────────── */

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, arr.length));
}

/* ── main ──────────────────────────────────────────────────────────── */

async function main() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    console.log('⚠️  MONGO_URI not set, attempting to use in-memory MongoDB...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      console.log('✅ In-memory MongoDB started');
    } catch (err) {
      console.error('❌ Failed to start in-memory MongoDB:', err.message);
      process.exit(1);
    }
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('💡 Trying in-memory MongoDB as fallback...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log('✅ In-memory MongoDB started');
    } catch (fallbackErr) {
      console.error('❌ Failed:', fallbackErr.message);
      process.exit(1);
    }
  }

  const dbName = mongoose.connection.name;
  await mongoose.connection.dropDatabase();
  console.log(`🗑️  Dropped database: ${dbName}`);

  const inviteCode = crypto.randomBytes(8).toString('hex');

  /* ── 1. Users ────────────────────────────────────────────────────── */

  const creator = await User.create({
    name: 'Alex Admin',
    email: 'admin@smythe.local',
    password: DEFAULT_PASSWORD,
    role: 'admin',
    status: 'active',
    lastActive: hoursAgo(0.5)
  });

  const org = await Organization.create({
    name: 'Smythe Technologies',
    creator: creator._id,
    members: [{ user: creator._id, role: 'admin' }],
    inviteCode,
    settings: { maxBoards: 50, maxMembers: 100, allowUserComments: true }
  });

  creator.organization = org._id;
  await creator.save();

  const userDefs = [
    { name: 'Morgan Admin',   email: 'morgan@smythe.local',  role: 'admin', lastActive: hoursAgo(1) },
    { name: 'Priya Patel',      email: 'priya@smythe.local',   role: 'admin', lastActive: hoursAgo(3) },
    { name: 'Uma User',         email: 'uma@smythe.local',     role: 'user',    lastActive: hoursAgo(0.25) },
    { name: 'Jake Rivera',      email: 'jake@smythe.local',    role: 'user',    lastActive: hoursAgo(6) },
    { name: 'Lin Chen',         email: 'lin@smythe.local',     role: 'user',    lastActive: hoursAgo(12) },
    { name: 'Sarah Invited',    email: 'sarah@smythe.local',   role: 'user',    status: 'invited' }
  ];

  const users = [];
  for (const def of userDefs) {
    const u = await User.create({
      ...def,
      password: DEFAULT_PASSWORD,
      organization: org._id,
      createdBy: creator._id,
      status: def.status || 'active'
    });
    users.push(u);
    org.members.push({ user: u._id, role: def.role });
  }
  await org.save();

  const [morgan, priya, uma, jake, lin, sarah] = users;
  const allActive = [creator, morgan, priya, uma, jake, lin];

  console.log(`👤 Created ${users.length + 1} users (1 creator, 2 managers, 3 active users, 1 invited)`);

  /* ── 2. Boards ───────────────────────────────────────────────────── */

  const boardEng = await Board.create({
    title: 'Engineering Sprint',
    description: 'Build and ship the next milestone — tasks assigned across the team.',
    organization: org._id,
    createdBy: creator._id,
    permissions: { visibility: 'organization' },
    progressDigest: { enabled: true, intervalHours: 4 },
    columns: [
      { name: 'Track', type: 'dropdown', options: ['Frontend', 'Backend', 'Infra', 'Mobile', 'DevOps'], order: 0, width: 130 },
      { name: 'Points', type: 'number', order: 1, width: 90 },
      { name: 'Spec link', type: 'url', order: 2, width: 160 },
      { name: 'Reviewed', type: 'checkbox', order: 3, width: 100 }
    ]
  });

  const boardOps = await Board.create({
    title: 'Operations & Support',
    description: 'Customer requests and internal ops — try filters, bulk actions, and comments.',
    organization: org._id,
    createdBy: morgan._id,
    permissions: { visibility: 'organization' },
    columns: [
      { name: 'Type', type: 'dropdown', options: ['Bug', 'Question', 'Request', 'Incident'], order: 0, width: 120 },
      { name: 'Customer', type: 'text', order: 1, width: 140 },
      { name: 'Severity', type: 'dropdown', options: ['P0', 'P1', 'P2', 'P3'], order: 2, width: 100 }
    ]
  });

  const boardDesign = await Board.create({
    title: 'Design System',
    description: 'Design tokens, component library, and visual consistency tasks.',
    organization: org._id,
    createdBy: priya._id,
    permissions: { visibility: 'organization' },
    columns: [
      { name: 'Component', type: 'text', order: 0, width: 150 },
      { name: 'Platform', type: 'dropdown', options: ['Web', 'Mobile', 'Both'], order: 1, width: 110 },
      { name: 'Figma link', type: 'url', order: 2, width: 160 }
    ]
  });

  const boardMarketing = await Board.create({
    title: 'Marketing & Growth',
    description: 'Campaigns, content calendar, and growth experiments.',
    organization: org._id,
    createdBy: creator._id,
    permissions: { visibility: 'organization' },
    columns: [
      { name: 'Channel', type: 'dropdown', options: ['Blog', 'Social', 'Email', 'Ads', 'SEO'], order: 0, width: 120 },
      { name: 'Launch date', type: 'date', order: 1, width: 130 },
      { name: 'Budget ($)', type: 'number', order: 2, width: 110 }
    ]
  });

  const boardArchived = await Board.create({
    title: 'Q3 Retrospective',
    description: 'Archived board from previous quarter review.',
    organization: org._id,
    createdBy: creator._id,
    permissions: { visibility: 'organization' },
    archived: true,
    columns: [
      { name: 'Category', type: 'dropdown', options: ['Win', 'Challenge', 'Action Item'], order: 0, width: 130 }
    ]
  });

  const boards = [boardEng, boardOps, boardDesign, boardMarketing, boardArchived];
  console.log(`📋 Created ${boards.length} boards (${boards.filter(b => !b.archived).length} active, 1 archived)`);

  /* ── column-value helper ─────────────────────────────────────────── */

  const col = (board, idx) => board.columns[idx]._id.toString();

  /* ── 3. Tasks ────────────────────────────────────────────────────── */

  const taskSpecs = [
    // ─── Engineering Sprint (12 tasks) ───────────────────────────────
    {
      board: boardEng, title: 'Dark mode polish for settings',
      description: 'Contrast fixes and focus rings on toggles. Check WCAG AA compliance.',
      status: 'in_progress', priority: 'high',
      assignedTo: [morgan._id], assignedBy: creator._id,
      dueDate: daysFromNow(3), order: 0,
      columnValues: { [col(boardEng, 0)]: 'Frontend', [col(boardEng, 1)]: 5, [col(boardEng, 3)]: false },
      comments: [
        { author: morgan._id, text: 'Picking this up today — will sync with design tokens.' },
        { author: creator._id, text: 'Thanks Morgan. @Uma can you review copy when ready?', mentions: [uma._id] },
        { author: uma._id, text: 'Sure thing, ping me when the PR is up!' }
      ]
    },
    {
      board: boardEng, title: 'API rate limiting per organization',
      description: 'Implement per-org limits on write endpoints. Need Redis config from infra team.',
      status: 'pending', priority: 'critical',
      assignedTo: [uma._id], assignedBy: creator._id,
      dueDate: daysFromNow(1), order: 1,
      columnValues: { [col(boardEng, 0)]: 'Backend', [col(boardEng, 1)]: 8 },
      comments: [
        { author: uma._id, text: 'Need Redis config from infra — blocked until then.' },
        { author: jake._id, text: 'I can set up the Redis instance this afternoon.' }
      ]
    },
    {
      board: boardEng, title: 'Deploy pipeline notifications',
      status: 'completed', priority: 'medium',
      assignedTo: [creator._id, morgan._id], assignedBy: creator._id,
      dueDate: daysFromNow(-2), completedAt: daysFromNow(-2), order: 2,
      columnValues: { [col(boardEng, 0)]: 'Infra', [col(boardEng, 1)]: 3, [col(boardEng, 3)]: true }
    },
    {
      board: boardEng, title: 'WebSocket reconnection handling',
      description: 'Auto-reconnect with exponential backoff when socket drops.',
      status: 'in_progress', priority: 'high',
      assignedTo: [jake._id], assignedBy: morgan._id,
      dueDate: daysFromNow(5), order: 3,
      columnValues: { [col(boardEng, 0)]: 'Frontend', [col(boardEng, 1)]: 5 },
      comments: [
        { author: jake._id, text: 'Got the backoff logic done. Testing edge cases now.' }
      ]
    },
    {
      board: boardEng, title: 'Board real-time sync review',
      status: 'blocked', priority: 'high',
      assignedTo: [morgan._id], assignedBy: uma._id,
      dueDate: daysFromNow(7), order: 4,
      columnValues: { [col(boardEng, 0)]: 'Backend', [col(boardEng, 1)]: 5 },
      comments: [
        { author: morgan._id, text: 'Blocked on WebSocket reconnection — need that merged first.' }
      ]
    },
    {
      board: boardEng, title: 'Database migration scripts',
      description: 'Create migration tooling for schema changes without downtime.',
      status: 'pending', priority: 'medium',
      assignedTo: [lin._id], assignedBy: priya._id,
      dueDate: daysFromNow(10), order: 5,
      columnValues: { [col(boardEng, 0)]: 'Backend', [col(boardEng, 1)]: 8, [col(boardEng, 3)]: false }
    },
    {
      board: boardEng, title: 'Mobile push notification setup',
      description: 'Integrate FCM for Android and APNs for iOS push notifications.',
      status: 'pending', priority: 'medium',
      assignedTo: [jake._id, lin._id], assignedBy: creator._id,
      dueDate: daysFromNow(14), order: 6,
      columnValues: { [col(boardEng, 0)]: 'Mobile', [col(boardEng, 1)]: 13 }
    },
    {
      board: boardEng, title: 'CI/CD pipeline optimization',
      description: 'Reduce build times from 12m to under 5m. Cache node_modules and Docker layers.',
      status: 'completed', priority: 'high',
      assignedTo: [lin._id], assignedBy: morgan._id,
      dueDate: daysFromNow(-7), completedAt: daysFromNow(-6), order: 7,
      columnValues: { [col(boardEng, 0)]: 'DevOps', [col(boardEng, 1)]: 5, [col(boardEng, 3)]: true },
      comments: [
        { author: lin._id, text: 'Build time down to 3m 45s after Docker layer caching! 🎉' },
        { author: morgan._id, text: 'Incredible work Lin. This saves the whole team time.' }
      ]
    },
    {
      board: boardEng, title: 'Search indexing for tasks',
      description: 'Full-text search with MongoDB text indexes. Support title, description, and comments.',
      status: 'in_progress', priority: 'medium',
      assignedTo: [uma._id, jake._id], assignedBy: priya._id,
      dueDate: daysFromNow(6), order: 8,
      columnValues: { [col(boardEng, 0)]: 'Backend', [col(boardEng, 1)]: 8 }
    },
    {
      board: boardEng, title: 'Keyboard shortcuts implementation',
      description: 'Support Ctrl+K command palette, J/K navigation, and common actions.',
      status: 'pending', priority: 'low',
      assignedTo: [], assignedBy: creator._id,
      dueDate: daysFromNow(21), order: 9,
      columnValues: { [col(boardEng, 0)]: 'Frontend', [col(boardEng, 1)]: 5 }
    },
    {
      board: boardEng, title: 'Accessibility audit — WCAG 2.1 AA',
      description: 'Run axe-core on all pages and fix critical violations.',
      status: 'cancelled', priority: 'medium',
      assignedTo: [morgan._id], assignedBy: creator._id,
      dueDate: daysFromNow(-3), order: 10,
      columnValues: { [col(boardEng, 0)]: 'Frontend', [col(boardEng, 1)]: 8, [col(boardEng, 3)]: false },
      comments: [
        { author: creator._id, text: 'Postponing to next sprint — reprioritized for launch items.' }
      ]
    },
    {
      board: boardEng, title: 'GraphQL API layer (experimental)',
      description: 'Prototype a GraphQL wrapper over current REST endpoints for mobile team.',
      status: 'pending', priority: 'low',
      assignedTo: [lin._id], assignedBy: priya._id,
      dueDate: daysFromNow(30), order: 11,
      columnValues: { [col(boardEng, 0)]: 'Backend', [col(boardEng, 1)]: 13 }
    },

    // ─── Operations & Support (8 tasks) ──────────────────────────────
    {
      board: boardOps, title: 'Export to CSV fails on large boards',
      description: 'Repro: 500+ rows, timeout after 30s. Switch to streaming response.',
      status: 'in_progress', priority: 'critical',
      assignedTo: [uma._id, morgan._id], assignedBy: morgan._id,
      dueDate: daysFromNow(0), order: 0,
      columnValues: { [col(boardOps, 0)]: 'Bug', [col(boardOps, 1)]: 'Acme Corp', [col(boardOps, 2)]: 'P0' },
      comments: [
        { author: morgan._id, text: 'Logged as P0 — Uma on investigation.' },
        { author: uma._id, text: 'Found the issue — we\'re loading all rows in memory. Switching to cursor-based streaming.' },
        { author: creator._id, text: 'Let me know if you need prod logs access.' }
      ]
    },
    {
      board: boardOps, title: 'Question: custom column limits',
      status: 'pending', priority: 'low',
      assignedTo: [morgan._id], assignedBy: uma._id,
      dueDate: daysFromNow(14), order: 1,
      columnValues: { [col(boardOps, 0)]: 'Question', [col(boardOps, 1)]: 'Internal', [col(boardOps, 2)]: 'P3' }
    },
    {
      board: boardOps, title: 'Request: Slack integration',
      status: 'pending', priority: 'medium',
      assignedTo: [], assignedBy: creator._id,
      dueDate: daysFromNow(30), order: 2,
      columnValues: { [col(boardOps, 0)]: 'Request', [col(boardOps, 1)]: 'Beta user pool', [col(boardOps, 2)]: 'P2' }
    },
    {
      board: boardOps, title: 'Renew SSL cert for status page',
      status: 'completed', priority: 'medium',
      assignedTo: [uma._id], assignedBy: morgan._id,
      dueDate: daysFromNow(-5), completedAt: daysFromNow(-5), order: 3,
      columnValues: { [col(boardOps, 0)]: 'Request', [col(boardOps, 1)]: 'Ops', [col(boardOps, 2)]: 'P1' }
    },
    {
      board: boardOps, title: 'Login page 500 error for SSO users',
      description: 'SAML callback returns malformed assertion in edge cases.',
      status: 'in_progress', priority: 'critical',
      assignedTo: [jake._id], assignedBy: priya._id,
      dueDate: daysFromNow(1), order: 4,
      columnValues: { [col(boardOps, 0)]: 'Incident', [col(boardOps, 1)]: 'GlobalTech Inc', [col(boardOps, 2)]: 'P0' },
      comments: [
        { author: jake._id, text: 'Reproduced — issue is with the IdP metadata caching. Fix incoming.' },
        { author: priya._id, text: 'Customer escalated. Please prioritize.' }
      ]
    },
    {
      board: boardOps, title: 'Email notifications delayed by 15min',
      description: 'Queue processing seems backed up during peak hours.',
      status: 'pending', priority: 'high',
      assignedTo: [lin._id], assignedBy: morgan._id,
      dueDate: daysFromNow(3), order: 5,
      columnValues: { [col(boardOps, 0)]: 'Bug', [col(boardOps, 1)]: 'Multiple', [col(boardOps, 2)]: 'P1' }
    },
    {
      board: boardOps, title: 'Request: Dark mode for public pages',
      status: 'completed', priority: 'low',
      assignedTo: [morgan._id], assignedBy: creator._id,
      dueDate: daysFromNow(-10), completedAt: daysFromNow(-8), order: 6,
      columnValues: { [col(boardOps, 0)]: 'Request', [col(boardOps, 1)]: 'Community', [col(boardOps, 2)]: 'P3' }
    },
    {
      board: boardOps, title: 'Database connection pool exhaustion',
      description: 'Under heavy load (> 200 concurrent), connections hang. Need pool tuning.',
      status: 'blocked', priority: 'high',
      assignedTo: [uma._id], assignedBy: priya._id,
      dueDate: daysFromNow(2), order: 7,
      columnValues: { [col(boardOps, 0)]: 'Bug', [col(boardOps, 1)]: 'Platform', [col(boardOps, 2)]: 'P1' },
      comments: [
        { author: uma._id, text: 'Need DBA access to check connection stats. @Priya can you unblock?' },
        { author: priya._id, text: 'Granted. Check your 1Password vault.' }
      ]
    },

    // ─── Design System (6 tasks) ─────────────────────────────────────
    {
      board: boardDesign, title: 'Button component variants',
      description: 'Primary, secondary, ghost, destructive. All sizes S/M/L with loading state.',
      status: 'completed', priority: 'high',
      assignedTo: [priya._id], assignedBy: creator._id,
      dueDate: daysFromNow(-4), completedAt: daysFromNow(-3), order: 0,
      columnValues: { [col(boardDesign, 0)]: 'Button', [col(boardDesign, 1)]: 'Both' }
    },
    {
      board: boardDesign, title: 'Input field + validation styles',
      description: 'Text, number, email, password inputs with error/success/disabled states.',
      status: 'in_progress', priority: 'high',
      assignedTo: [priya._id, morgan._id], assignedBy: priya._id,
      dueDate: daysFromNow(2), order: 1,
      columnValues: { [col(boardDesign, 0)]: 'Input', [col(boardDesign, 1)]: 'Web' },
      comments: [
        { author: priya._id, text: 'Base styles done. Validation animations are next.' }
      ]
    },
    {
      board: boardDesign, title: 'Modal / dialog component',
      description: 'Focus trap, backdrop click dismiss, nested modal support.',
      status: 'pending', priority: 'medium',
      assignedTo: [morgan._id], assignedBy: priya._id,
      dueDate: daysFromNow(7), order: 2,
      columnValues: { [col(boardDesign, 0)]: 'Modal', [col(boardDesign, 1)]: 'Web' }
    },
    {
      board: boardDesign, title: 'Toast notification system',
      description: 'Stack-based toasts with auto-dismiss. Success, error, warning, info.',
      status: 'pending', priority: 'medium',
      assignedTo: [jake._id], assignedBy: priya._id,
      dueDate: daysFromNow(12), order: 3,
      columnValues: { [col(boardDesign, 0)]: 'Toast', [col(boardDesign, 1)]: 'Both' }
    },
    {
      board: boardDesign, title: 'Color token audit',
      description: 'Ensure all CSS custom properties follow naming convention and have dark-mode counterparts.',
      status: 'completed', priority: 'critical',
      assignedTo: [priya._id], assignedBy: creator._id,
      dueDate: daysFromNow(-1), completedAt: daysFromNow(-1), order: 4,
      columnValues: { [col(boardDesign, 0)]: 'Tokens', [col(boardDesign, 1)]: 'Both' },
      comments: [
        { author: priya._id, text: 'All 86 tokens audited. 14 were missing dark variants — now fixed.' },
        { author: creator._id, text: 'Excellent cleanup! This will pay off across the whole app.' }
      ]
    },
    {
      board: boardDesign, title: 'Data table component',
      description: 'Sortable columns, row selection, pagination, and inline editing.',
      status: 'in_progress', priority: 'high',
      assignedTo: [jake._id, uma._id], assignedBy: priya._id,
      dueDate: daysFromNow(8), order: 5,
      columnValues: { [col(boardDesign, 0)]: 'Table', [col(boardDesign, 1)]: 'Web' }
    },

    // ─── Marketing & Growth (5 tasks) ────────────────────────────────
    {
      board: boardMarketing, title: 'Product launch blog post',
      description: 'Write and publish the v2.0 launch announcement with screenshots.',
      status: 'in_progress', priority: 'critical',
      assignedTo: [priya._id], assignedBy: creator._id,
      dueDate: daysFromNow(2), order: 0,
      columnValues: { [col(boardMarketing, 0)]: 'Blog', [col(boardMarketing, 1)]: daysFromNow(2).toISOString(), [col(boardMarketing, 2)]: 0 },
      comments: [
        { author: priya._id, text: 'Draft is at 80%. Need final screenshots from the latest build.' },
        { author: creator._id, text: 'I\'ll share app screenshots by EOD today.' }
      ]
    },
    {
      board: boardMarketing, title: 'Social media campaign — launch week',
      description: 'Twitter/LinkedIn posts scheduled for launch week. 3 posts per day.',
      status: 'pending', priority: 'high',
      assignedTo: [priya._id], assignedBy: creator._id,
      dueDate: daysFromNow(5), order: 1,
      columnValues: { [col(boardMarketing, 0)]: 'Social', [col(boardMarketing, 1)]: daysFromNow(3).toISOString(), [col(boardMarketing, 2)]: 500 }
    },
    {
      board: boardMarketing, title: 'Welcome email drip sequence',
      description: 'Set up 5-email onboarding drip for new signups.',
      status: 'pending', priority: 'medium',
      assignedTo: [lin._id], assignedBy: priya._id,
      dueDate: daysFromNow(10), order: 2,
      columnValues: { [col(boardMarketing, 0)]: 'Email', [col(boardMarketing, 1)]: daysFromNow(7).toISOString(), [col(boardMarketing, 2)]: 200 }
    },
    {
      board: boardMarketing, title: 'Google Ads campaign setup',
      description: 'Target SaaS decision-makers. Initial budget $2k/month.',
      status: 'pending', priority: 'low',
      assignedTo: [], assignedBy: creator._id,
      dueDate: daysFromNow(20), order: 3,
      columnValues: { [col(boardMarketing, 0)]: 'Ads', [col(boardMarketing, 1)]: daysFromNow(14).toISOString(), [col(boardMarketing, 2)]: 2000 }
    },
    {
      board: boardMarketing, title: 'SEO optimization for landing page',
      description: 'Meta tags, structured data, page speed optimization, and keyword research.',
      status: 'completed', priority: 'high',
      assignedTo: [lin._id], assignedBy: creator._id,
      dueDate: daysFromNow(-3), completedAt: daysFromNow(-2), order: 4,
      columnValues: { [col(boardMarketing, 0)]: 'SEO', [col(boardMarketing, 1)]: daysFromNow(-3).toISOString(), [col(boardMarketing, 2)]: 0 },
      comments: [
        { author: lin._id, text: 'Lighthouse score went from 62 to 94. All meta tags in place.' }
      ]
    },

    // ─── Archived board (2 tasks) ────────────────────────────────────
    {
      board: boardArchived, title: 'Shipped real-time collaboration',
      status: 'completed', priority: 'high',
      assignedTo: [creator._id, morgan._id], assignedBy: creator._id,
      dueDate: daysFromNow(-30), completedAt: daysFromNow(-28), order: 0,
      columnValues: { [col(boardArchived, 0)]: 'Win' }
    },
    {
      board: boardArchived, title: 'Onboarding flow was confusing',
      description: 'New users struggled with org setup. Addressed in v1.5.',
      status: 'completed', priority: 'medium',
      assignedTo: [priya._id], assignedBy: morgan._id,
      dueDate: daysFromNow(-25), completedAt: daysFromNow(-22), order: 1,
      columnValues: { [col(boardArchived, 0)]: 'Challenge' }
    }
  ];

  let taskCount = 0;
  const createdTasks = [];

  for (const spec of taskSpecs) {
    const {
      board, title, description, status, priority,
      assignedTo, assignedBy, dueDate, completedAt,
      order, columnValues, comments
    } = spec;

    const historyEntries = [
      { changedBy: assignedBy || creator._id, action: 'created', timestamp: daysFromNow(-15 + order) }
    ];
    if (status === 'completed') {
      historyEntries.push({
        changedBy: (assignedTo && assignedTo[0]) || assignedBy || creator._id,
        action: 'status_changed', field: 'status',
        oldValue: 'in_progress', newValue: 'completed',
        timestamp: completedAt || daysFromNow(-1)
      });
    }
    if (status === 'in_progress') {
      historyEntries.push({
        changedBy: (assignedTo && assignedTo[0]) || assignedBy || creator._id,
        action: 'status_changed', field: 'status',
        oldValue: 'pending', newValue: 'in_progress',
        timestamp: daysFromNow(-3 + order)
      });
    }

    const task = await Task.create({
      board: board._id, title, description, status, priority,
      assignedTo, assignedBy, dueDate, completedAt, order,
      columnValues: columnValues || {},
      comments: comments || [],
      history: historyEntries
    });
    createdTasks.push({ task, spec });
    taskCount++;
  }

  console.log(`✅ Created ${taskCount} tasks across ${boards.length} boards`);

  /* ── 4. Subtasks ─────────────────────────────────────────────────── */

  const darkModeTask = createdTasks.find(t => t.spec.title.includes('Dark mode'));
  const csvTask = createdTasks.find(t => t.spec.title.includes('Export to CSV'));

  const subtaskSpecs = [
    {
      parent: darkModeTask?.task, board: boardEng,
      title: 'Audit focus styles in modals',
      description: 'Child of dark mode work. Check all modal focus indicators.',
      status: 'pending', priority: 'medium',
      assignedTo: [uma._id], assignedBy: morgan._id,
      dueDate: daysFromNow(5), order: 100,
      columnValues: { [col(boardEng, 0)]: 'Frontend', [col(boardEng, 1)]: 2 }
    },
    {
      parent: darkModeTask?.task, board: boardEng,
      title: 'Update color-scheme meta tag',
      description: 'Ensure browser chrome matches selected theme.',
      status: 'completed', priority: 'low',
      assignedTo: [morgan._id], assignedBy: morgan._id,
      dueDate: daysFromNow(1), completedAt: daysFromNow(0), order: 101,
      columnValues: { [col(boardEng, 0)]: 'Frontend', [col(boardEng, 1)]: 1 }
    },
    {
      parent: csvTask?.task, board: boardOps,
      title: 'Add progress bar for CSV export',
      description: 'Show download progress for large exports.',
      status: 'pending', priority: 'medium',
      assignedTo: [jake._id], assignedBy: morgan._id,
      dueDate: daysFromNow(3), order: 102,
      columnValues: { [col(boardOps, 0)]: 'Bug', [col(boardOps, 1)]: 'Acme Corp', [col(boardOps, 2)]: 'P1' }
    }
  ];

  for (const sub of subtaskSpecs) {
    if (!sub.parent) continue;
    await Task.create({
      board: sub.board._id,
      title: sub.title,
      description: sub.description,
      status: sub.status,
      priority: sub.priority,
      assignedTo: sub.assignedTo,
      assignedBy: sub.assignedBy,
      parentTask: sub.parent._id,
      dueDate: sub.dueDate,
      completedAt: sub.completedAt,
      order: sub.order,
      columnValues: sub.columnValues,
      history: [{ changedBy: sub.assignedBy, action: 'created', timestamp: new Date() }]
    });
    taskCount++;
  }

  console.log(`🔗 Created ${subtaskSpecs.length} subtasks`);

  /* ── 5. Activity Logs ────────────────────────────────────────────── */

  const activitySpecs = [
    { board: boardEng, action: 'board_created', target: { type: 'board', id: boardEng._id, name: boardEng.title }, user: creator._id },
    { board: boardOps, action: 'board_created', target: { type: 'board', id: boardOps._id, name: boardOps.title }, user: morgan._id },
    { board: boardDesign, action: 'board_created', target: { type: 'board', id: boardDesign._id, name: boardDesign.title }, user: priya._id },
    { board: boardMarketing, action: 'board_created', target: { type: 'board', id: boardMarketing._id, name: boardMarketing.title }, user: creator._id },
    { board: boardArchived, action: 'board_archived', target: { type: 'board', id: boardArchived._id, name: boardArchived.title }, user: creator._id },
    { board: boardEng, action: 'task_created', target: { type: 'task', name: 'Dark mode polish' }, user: creator._id },
    { board: boardEng, action: 'task_created', target: { type: 'task', name: 'API rate limiting' }, user: creator._id },
    { board: boardEng, action: 'task_assigned', target: { type: 'task', name: 'WebSocket reconnection' }, user: morgan._id },
    { board: boardEng, action: 'status_changed', target: { type: 'task', name: 'CI/CD pipeline optimization' }, user: lin._id, changes: [{ field: 'status', from: 'in_progress', to: 'completed' }] },
    { board: boardEng, action: 'status_changed', target: { type: 'task', name: 'Deploy pipeline notifications' }, user: creator._id, changes: [{ field: 'status', from: 'in_progress', to: 'completed' }] },
    { board: boardOps, action: 'comment_added', target: { type: 'task', name: 'Export to CSV' }, user: uma._id },
    { board: boardOps, action: 'comment_added', target: { type: 'task', name: 'Export to CSV' }, user: morgan._id },
    { board: boardOps, action: 'task_created', target: { type: 'task', name: 'Login page 500 error' }, user: priya._id },
    { board: boardOps, action: 'status_changed', target: { type: 'task', name: 'Renew SSL cert' }, user: uma._id, changes: [{ field: 'status', from: 'in_progress', to: 'completed' }] },
    { board: boardDesign, action: 'task_created', target: { type: 'task', name: 'Button component variants' }, user: creator._id },
    { board: boardDesign, action: 'status_changed', target: { type: 'task', name: 'Color token audit' }, user: priya._id, changes: [{ field: 'status', from: 'in_progress', to: 'completed' }] },
    { board: boardDesign, action: 'comment_added', target: { type: 'task', name: 'Input field + validation' }, user: priya._id },
    { board: boardMarketing, action: 'task_created', target: { type: 'task', name: 'Product launch blog post' }, user: creator._id },
    { board: boardMarketing, action: 'comment_added', target: { type: 'task', name: 'SEO optimization' }, user: lin._id },
    { action: 'user_invited', target: { type: 'user', id: sarah._id, name: 'Sarah Invited' }, user: creator._id },
    { action: 'role_changed', target: { type: 'user', id: priya._id, name: 'Priya Patel' }, user: creator._id, changes: [{ field: 'role', from: 'user', to: 'admin' }] },
    { board: boardEng, action: 'column_added', target: { type: 'column', name: 'Reviewed' }, user: creator._id },
    { board: boardOps, action: 'column_added', target: { type: 'column', name: 'Severity' }, user: morgan._id },
    { board: boardEng, action: 'bulk_status_change', target: { type: 'task', name: '3 tasks' }, user: morgan._id, metadata: { count: 3, newStatus: 'in_progress' } }
  ];

  for (const spec of activitySpecs) {
    await ActivityLog.create({
      organization: org._id,
      board: spec.board?._id,
      user: spec.user,
      action: spec.action,
      target: spec.target,
      changes: spec.changes,
      metadata: spec.metadata
    });
  }

  console.log(`📝 Created ${activitySpecs.length} activity log entries`);

  /* ── 6. Notifications ────────────────────────────────────────────── */

  const notifSpecs = [
    // Task assignments
    { recipient: morgan._id, sender: creator._id, type: 'task_assigned', title: 'New task assigned', message: 'Alex assigned you "Dark mode polish for settings"', board: boardEng._id, read: false },
    { recipient: uma._id, sender: creator._id, type: 'task_assigned', title: 'New task assigned', message: 'Alex assigned you "API rate limiting per organization"', board: boardEng._id, read: false },
    { recipient: jake._id, sender: morgan._id, type: 'task_assigned', title: 'New task assigned', message: 'Morgan assigned you "WebSocket reconnection handling"', board: boardEng._id, read: true, readAt: hoursAgo(2) },
    { recipient: lin._id, sender: priya._id, type: 'task_assigned', title: 'New task assigned', message: 'Priya assigned you "Database migration scripts"', board: boardEng._id, read: false },
    { recipient: uma._id, sender: morgan._id, type: 'task_assigned', title: 'New task assigned', message: 'Morgan assigned you "Export to CSV fails on large boards"', board: boardOps._id, read: true, readAt: hoursAgo(5) },
    { recipient: jake._id, sender: priya._id, type: 'task_assigned', title: 'New task assigned', message: 'Priya assigned you "Login page 500 error for SSO users"', board: boardOps._id, read: false },

    // Status changes
    { recipient: creator._id, sender: lin._id, type: 'status_changed', title: 'Task completed', message: 'Lin marked "CI/CD pipeline optimization" as completed', board: boardEng._id, read: true, readAt: hoursAgo(12) },
    { recipient: morgan._id, sender: lin._id, type: 'status_changed', title: 'Task completed', message: 'Lin marked "CI/CD pipeline optimization" as completed', board: boardEng._id, read: true, readAt: hoursAgo(10) },
    { recipient: creator._id, sender: priya._id, type: 'status_changed', title: 'Task completed', message: 'Priya marked "Color token audit" as completed', board: boardDesign._id, read: false },

    // Comments / mentions
    { recipient: uma._id, sender: creator._id, type: 'mentioned', title: 'You were mentioned', message: 'Alex mentioned you in "Dark mode polish for settings": "...@Uma can you review copy when ready?"', board: boardEng._id, read: false },
    { recipient: morgan._id, sender: uma._id, type: 'comment_added', title: 'New comment', message: 'Uma commented on "Export to CSV fails": "Found the issue — we\'re loading all rows in memory..."', board: boardOps._id, read: false },
    { recipient: priya._id, sender: uma._id, type: 'mentioned', title: 'You were mentioned', message: 'Uma mentioned you in "Database connection pool exhaustion"', board: boardOps._id, read: false },

    // Deadlines
    { recipient: uma._id, sender: null, type: 'deadline_approaching', title: 'Deadline tomorrow', message: '"API rate limiting per organization" is due tomorrow', board: boardEng._id, read: false },
    { recipient: uma._id, sender: null, type: 'deadline_approaching', title: 'Deadline today', message: '"Export to CSV fails on large boards" is due today', board: boardOps._id, read: false },
    { recipient: morgan._id, sender: null, type: 'deadline_approaching', title: 'Deadline today', message: '"Export to CSV fails on large boards" is due today', board: boardOps._id, read: false },
    { recipient: jake._id, sender: null, type: 'deadline_approaching', title: 'Deadline tomorrow', message: '"Login page 500 error for SSO users" is due tomorrow', board: boardOps._id, read: false },

    // Overdue
    { recipient: morgan._id, sender: null, type: 'deadline_overdue', title: 'Task overdue', message: '"Accessibility audit — WCAG 2.1 AA" is 3 days overdue', board: boardEng._id, read: true, readAt: hoursAgo(8) },

    // Board shared
    { recipient: jake._id, sender: priya._id, type: 'board_shared', title: 'Board shared with you', message: 'Priya shared "Design System" board with the organization', board: boardDesign._id, read: true, readAt: hoursAgo(24) },

    // Bulk assign
    { recipient: uma._id, sender: priya._id, type: 'bulk_assigned', title: 'Multiple tasks assigned', message: 'Priya assigned you 2 tasks in "Design System"', board: boardDesign._id, read: false },

    // Progress digest
    { recipient: creator._id, sender: null, type: 'progress_digest', title: 'Engineering Sprint — Progress Summary', message: '4 tasks in progress, 2 completed, 3 pending. 1 task overdue.', board: boardEng._id, read: false },
    { recipient: morgan._id, sender: null, type: 'progress_digest', title: 'Engineering Sprint — Progress Summary', message: '4 tasks in progress, 2 completed, 3 pending. 1 task overdue.', board: boardEng._id, read: false }
  ];

  for (const spec of notifSpecs) {
    await Notification.create({
      recipient: spec.recipient,
      sender: spec.sender,
      type: spec.type,
      title: spec.title,
      message: spec.message,
      board: spec.board,
      read: spec.read || false,
      readAt: spec.readAt || null,
      expiresAt: daysFromNow(30)
    });
  }

  console.log(`🔔 Created ${notifSpecs.length} notifications`);

  /* ── Summary ─────────────────────────────────────────────────────── */

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         🌱  SEED COMPLETE                    ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Organization: Smythe Technologies           ║`);
  console.log(`║  Invite code:  ${inviteCode}  ║`);
  console.log(`║  Boards:       ${boards.length} (${boards.filter(b => !b.archived).length} active, 1 archived)            ║`);
  console.log(`║  Tasks:        ${taskCount} (incl. ${subtaskSpecs.length} subtasks)              ║`);
  console.log(`║  Activity logs: ${activitySpecs.length}                           ║`);
  console.log(`║  Notifications: ${notifSpecs.length}                           ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  LOGINS (password for all):                  ║');
  console.log(`║  ${DEFAULT_PASSWORD}                      ║`);
  console.log('║                                              ║');
  console.log('║  creator   creator@smythe.local              ║');
  console.log('║  manager   morgan@smythe.local               ║');
  console.log('║  manager   priya@smythe.local                ║');
  console.log('║  user      uma@smythe.local                  ║');
  console.log('║  user      jake@smythe.local                 ║');
  console.log('║  user      lin@smythe.local                  ║');
  console.log('║  invited   sarah@smythe.local                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
