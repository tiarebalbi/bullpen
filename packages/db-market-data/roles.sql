-- Run once, as the database admin role, after the role market_data_owner exists
-- (`db:create-roles` creates it as a plain role). It holds no password.
-- The admin role can grant a role it created to itself, which is what lets
-- it run this owner's migrations. Do not create the role in a provider's
-- console: some consoles make it a member of a superuser-like role that reads
-- and writes every schema, and the admin role cannot revoke that.
GRANT market_data_owner TO CURRENT_USER;
