-- Constraints Prisma's schema language can't express directly:
-- range/relational CHECKs and partial (WHERE-scoped) unique indexes.

ALTER TABLE vehicles      ADD CONSTRAINT vehicles_capacity_chk   CHECK (capacity BETWEEN 1 AND 6);
ALTER TABLE pools         ADD CONSTRAINT pools_seats_chk         CHECK (seats_occupied >= 0 AND seats_occupied <= capacity);
ALTER TABLE pool_members  ADD CONSTRAINT pool_members_seats_chk  CHECK (seats >= 1);
ALTER TABLE ride_requests ADD CONSTRAINT ride_seats_chk          CHECK (seats BETWEEN 1 AND 3);
ALTER TABLE ride_requests ADD CONSTRAINT ride_zones_chk          CHECK (pickup_zone_id <> dropoff_zone_id);
ALTER TABLE ride_requests ADD CONSTRAINT ride_fare_chk           CHECK (estimated_fare_paisa >= 0 AND (final_fare_paisa IS NULL OR final_fare_paisa >= 0));
ALTER TABLE users         ADD CONSTRAINT users_wallet_chk        CHECK (wallet_balance_paisa >= 0);
ALTER TABLE payments      ADD CONSTRAINT payments_amount_chk     CHECK (amount_paisa >= 0);

-- one active ride per passenger
CREATE UNIQUE INDEX ride_requests_one_active_per_passenger
  ON ride_requests (passenger_id) WHERE status IN ('REQUESTED','MATCHED','IN_PROGRESS');

-- one active pool per driver
CREATE UNIQUE INDEX pools_one_active_per_driver
  ON pools (driver_id) WHERE status IN ('ACCEPTED','DRIVER_ARRIVED','STARTED');

-- a request can be in only one pool at a time
CREATE UNIQUE INDEX pool_members_one_active_per_request
  ON pool_members (ride_request_id) WHERE left_at IS NULL;
