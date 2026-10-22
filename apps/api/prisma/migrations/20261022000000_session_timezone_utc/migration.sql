-- Every timestamp column is TIMESTAMP(3) WITHOUT TIME ZONE holding UTC (Prisma writes UTC). Raw SQL compares
-- those columns with now() and with Date parameters (sent as timestamptz); both are read in the session
-- TimeZone. On a server whose default zone is not UTC (a Mac's Homebrew Postgres in IST, a self-hosted box)
-- webhook retries fired at once, 30 s leases lasted 5.5 h and a gold rate scheduled for later applied now.
-- Pin the database default to UTC. Neon and the docker image already default to UTC, so there it changes
-- nothing. New sessions pick it up; a role that does not own the database only gets a notice (never a failed
-- deploy), and the API logs an error at boot on a non-UTC session (src/prisma.service.ts).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'jewelroute: cannot set the database timezone to UTC (not the owner); set it by hand';
END $$;
