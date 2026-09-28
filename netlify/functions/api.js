const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const { server, hydrateDatabase, persistDatabase } = require('../../server');

const handler = serverless(server, { requestId: true });

exports.handler = async (event, context) => {
  // Netlify redirect sends /api/* to /.netlify/functions/api/*; restore the application route.
  const rawPath = event.path || event.rawPath || '/';
  const normalized = rawPath.replace(/^\/\.netlify\/functions\/api/, '') || '/';
  event.path = normalized.startsWith('/api/') || normalized === '/api' ? normalized : ('/api' + (normalized.startsWith('/') ? normalized : '/' + normalized));
  event.rawPath = event.path;
  connectLambda(event);
  await hydrateDatabase();
  const result = await handler(event, context);
  await persistDatabase();
  return result;
};
