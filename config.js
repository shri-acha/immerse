export const config = {
  TMT_API_KEY: typeof process !== 'undefined' && process.env ? process.env.TMT_API_KEY : "" // Set via environment variables during build
};
