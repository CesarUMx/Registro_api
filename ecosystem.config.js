module.exports = {
  apps: [{
    name: "umx-vigilancia-backend",
    script: "src/index.js",  // Ajusta según el punto de entrada de tu backend
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: 3002
      // Agrega aquí otras variables de entorno necesarias
    }
  }]
};
