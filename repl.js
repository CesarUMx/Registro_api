// node REPL
const bcrypt = require('bcrypt');
bcrypt.hash('prueba123456', 10).then(console.log);
// Copia el string resultante, p.e. "$2b$10$..."
