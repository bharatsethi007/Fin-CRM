-- RAG: vector store for parsed documents, notes, and bank statements (OpenAI text-embedding-3-small = 1536 dims)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.document_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL
);

CREATE INDEX idx_document_embeddings_firm_id ON public.document_embeddings(firm_id);
CREATE INDEX idx_document_embeddings_firm_source ON public.document_embeddings(firm_id, source_type);

CREATE INDEX idx_document_embeddings_vector ON public.document_embeddings
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access document_embeddings"
  ON public.document_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

/** Semantic search for Flow Intelligence rag_search tool */
CREATE OR REPLACE FUNCTION public.search_documents(
  p_firm_id uuid,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 5,
  p_source_type text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  source_type text,
  similarity double precision,
  metadata jsonb,
  client_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    de.id,
    de.content,
    de.source_type,
    (1 - (de.embedding <=> p_query_embedding))::double precision AS similarity,
    de.metadata,
    de.client_id
  FROM public.document_embeddings de
  WHERE de.firm_id = p_firm_id
    AND (p_source_type IS NULL OR de.source_type = p_source_type)
    AND (p_client_id IS NULL OR de.client_id = p_client_id)
  ORDER BY de.embedding <=> p_query_embedding
  LIMIT greatest(1, least(coalesce(p_match_count, 5), 50));
$$;

COMMENT ON FUNCTION public.search_documents IS 'Cosine similarity search over document_embeddings for RAG';
