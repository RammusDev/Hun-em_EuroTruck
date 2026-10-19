import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const runtime=sqliteTable('hunem_runtime',{id:text('id').primaryKey(),value:text('value').notNull(),revision:integer('revision').notNull().default(0),updatedAt:integer('updated_at').notNull(),lease:text('lease'),leaseUntil:integer('lease_until')});
export const objects=sqliteTable('hunem_objects',{path:text('path').primaryKey(),sha256:text('sha256').notNull(),bytes:integer('bytes').notNull(),createdAt:integer('created_at').notNull()});

// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.

export const authFlows=sqliteTable('auth_flows',{nonce:text('nonce').primaryKey(),expires:integer('expires').notNull()});
export const members=sqliteTable('members',{sub:text('sub').primaryKey(),email:text('email').notNull(),status:text('status').notNull().default('unrequested')});
export const owner=sqliteTable('owner_identity',{id:integer('id').primaryKey(),sub:text('sub').notNull()});
export const sessions=sqliteTable('sessions',{id:text('id').primaryKey(),sub:text('sub').notNull(),expires:integer('expires').notNull()});
export const requests=sqliteTable('access_requests',{sub:text('sub').primaryKey(),reason:text('reason').notNull(),created:integer('created').notNull()});
export const settings=sqliteTable('access_settings',{id:integer('id').primaryKey(),capacity:integer('capacity').notNull()});
export const audit=sqliteTable('audit_events',{id:text('id').primaryKey(),actor:text('actor').notNull(),subject:text('subject').notNull(),action:text('action').notNull(),created:integer('created').notNull()});
export const outbox=sqliteTable('notification_outbox',{id:text('id').primaryKey(),sub:text('sub').notNull(),payload:text('payload').notNull(),state:text('state').notNull(),attempts:integer('attempts').notNull().default(0),firstAttempt:integer('first_attempt'),nextAttempt:integer('next_attempt').notNull(),leaseUntil:integer('lease_until'),lease:text('lease'),providerId:text('provider_id'),error:text('error')});
