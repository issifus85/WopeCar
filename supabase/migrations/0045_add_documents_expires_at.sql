-- Expiry date for car compliance documents (roadworthy/insurance, added in
-- 0018_add_car_compliance_documents.sql) - admin needs to see when each
-- expires, not just that a file was uploaded. Lives on `documents` itself
-- (one row per upload) rather than as separate columns on `cars`, matching
-- the existing "latest wins per type" read pattern in services/documentsApi.js's
-- getCarDocuments()/getVehicleDocs() - a car-level column would desync from
-- whichever document row is actually "latest" once a document is replaced.
-- Nullable and meaningful only for roadworthy/insurance rows; every other
-- document type (license, proof_of_address, vendor KYC docs) leaves it null.
alter table public.documents add column if not exists expires_at date;
