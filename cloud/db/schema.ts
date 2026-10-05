import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  owner: text('owner').primaryKey(),
  revision: integer('revision').notNull(),
  writeTag: text('write_tag').notNull(),
  payload: text('payload').notNull(),
});
export const shares = sqliteTable('shares', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  payload: text('payload').notNull(),
}, table => [index('idx_shares_owner').on(table.owner)]);
