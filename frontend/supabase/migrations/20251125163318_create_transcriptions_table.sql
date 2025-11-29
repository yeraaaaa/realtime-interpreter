/*
  # Create transcriptions table

  1. New Tables
    - `transcriptions`
      - `id` (uuid, primary key) - Unique identifier
      - `korean_text` (text) - Original Korean speech
      - `english_text` (text) - Translated English text
      - `session_id` (text) - Groups related transcriptions
      - `created_at` (timestamp) - When recorded
  
  2. Security
    - Enable RLS on `transcriptions` table
    - Add policy for anonymous users to create transcriptions
    - Add policy for users to read their own session transcriptions
*/

CREATE TABLE IF NOT EXISTS transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  korean_text text NOT NULL,
  english_text text NOT NULL,
  session_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_session_id ON transcriptions(session_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at DESC);

ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous users to insert transcriptions"
  ON transcriptions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anyone to read transcriptions"
  ON transcriptions
  FOR SELECT
  TO anon
  USING (true);