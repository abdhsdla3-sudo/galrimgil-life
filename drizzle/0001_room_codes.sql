CREATE TABLE room_codes (
  code TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'life',
  hold_until INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX room_codes_room ON room_codes(room_id);
--> statement-breakpoint
CREATE INDEX room_codes_hold ON room_codes(hold_until);
