CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX rooms_expiry ON rooms(expires_at);
--> statement-breakpoint
CREATE TABLE room_limits (
  key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  hits INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX room_limits_expiry ON room_limits(expires_at);
