export const SQL_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'perform_sql_query',
    description:
      'Execute a read-only SQL query against the database to retrieve information.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SQL query to execute. Must be a SELECT statement.',
        },
      },
      required: ['query'],
    },
  },
};
