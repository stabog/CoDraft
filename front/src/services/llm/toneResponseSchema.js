/**
 * OpenRouter structured output для tone picker.
 * @returns {object}
 */
export function buildToneResponseSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'ToneResponse',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          context: {
            type: 'string',
            description: 'Full rewritten markdown context',
          },
        },
        required: ['context'],
        additionalProperties: false,
      },
    },
  }
}
