// Admin Panel's Support Inbox entry point - reuses the exact same Express
// Desk screen (app/staff-inbox/index.js) rather than duplicating it, since
// is_support() already grants admins the same scope:'all' access support
// staff have. Rows still navigate to /staff-inbox/[id] for the detail view.
export { default } from '../../staff-inbox/index';
