import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const runtime=sqliteTable('hunem_runtime',{id:text('id').primaryKey(),value:text('value').notNull(),revision:integer('revision').notNull().default(0),updatedAt:integer('updated_at').notNull(),lease:text('lease'),leaseUntil:integer('lease_until')});
export const objects=sqliteTable('hunem_objects',{path:text('path').primaryKey(),sha256:text('sha256').notNull(),bytes:integer('bytes').notNull(),createdAt:integer('created_at').notNull()});
