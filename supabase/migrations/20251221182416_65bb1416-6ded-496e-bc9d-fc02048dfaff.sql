CREATE OR REPLACE FUNCTION get_table_schema()
RETURNS TABLE (
    table_name NAME,
    column_name NAME,
    data_type VARCHAR,
    is_nullable VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
RETURN QUERY
SELECT
        c.table_name::NAME,
        c.column_name::NAME,
        c.data_type,
        c.is_nullable
FROM
        information_schema.columns AS c
WHERE
        c.table_schema = 'public'
ORDER BY
        c.table_name, c.ordinal_position;
END;
$$;