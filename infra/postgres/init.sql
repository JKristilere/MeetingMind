-- MeetingMind database initialisation
-- Extensions used by the application

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- Powers fast text search on meeting titles/transcripts
CREATE EXTENSION IF NOT EXISTS "unaccent";  -- Normalise accented characters in searches

-- Full-text search configuration optimised for multilingual African content
CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS african_english (COPY = english);
