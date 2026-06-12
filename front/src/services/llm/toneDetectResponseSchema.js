/**
 * OpenRouter structured output для определения тона фрагмента.
 * @returns {object}
 */
export function buildToneDetectResponseSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'ToneDetectResponse',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          formal: {
            type: 'integer',
            description: '0 = Informal, 10 = Formal',
          },
          positive: {
            type: 'integer',
            description: '0 = Negative, 10 = Positive',
          },
          simple: {
            type: 'integer',
            description: '0 = Complicated, 10 = Simple',
          },
        },
        required: ['formal', 'positive', 'simple'],
        additionalProperties: false,
      },
    },
  }
}
