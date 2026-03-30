require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  asaas: {
    apiUrl: process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3',
    apiKey: process.env.ASAAS_API_KEY,
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
  },

  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE || 'cobranca',
  },

  whatsappMeta: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  },

  zapi: {
    instanceId: process.env.ZAPI_INSTANCE_ID,
    token: process.env.ZAPI_TOKEN,
    clientToken: process.env.ZAPI_CLIENT_TOKEN,
  },

  cobranca: {
    horarios: [
      process.env.COBRANCA_HORARIO_1 || '07:30',
      process.env.COBRANCA_HORARIO_2 || '12:00',
      process.env.COBRANCA_HORARIO_3 || '17:30',
      process.env.COBRANCA_HORARIO_4 || '20:00',
    ],
  },
};
