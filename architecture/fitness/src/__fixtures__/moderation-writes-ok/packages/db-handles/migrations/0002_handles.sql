CREATE TABLE IF NOT EXISTS handles.handle (handle text);
GRANT USAGE ON SCHEMA handles TO trading_owner;
GRANT SELECT ON handles.approved_v1 TO trading_owner;
