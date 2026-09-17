import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const saves = sqliteTable('game_saves', {
  userId: text('user_id').primaryKey().notNull(),
  state: text('state').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});
