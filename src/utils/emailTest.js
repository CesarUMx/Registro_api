// src/utils/emailTest.js
require('dotenv').config(); // Cargar variables de entorno
const transporter = require('../config/emailConfig');

/**
 * Función para probar el envío de correo electrónico
 */
async function testEmail() {
  try {
    console.log('Configuración de correo:');
    console.log('- HOST:', process.env.EMAIL_HOST || 'smtp.gmail.com');
    console.log('- PORT:', process.env.EMAIL_PORT || 587);
    console.log('- SECURE:', process.env.EMAIL_SECURE === 'true' || false);
    console.log('- USER:', process.env.EMAIL_USER ? '(configurado)' : '(no configurado)');
    console.log('- PASSWORD:', process.env.EMAIL_PASSWORD ? '(configurado)' : '(no configurado)');
    
    // Intentar enviar un correo de prueba
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER || 'sistema.vigilancia@umx.com',
      to: process.env.TEST_EMAIL || process.env.EMAIL_USER,
      subject: 'Prueba de correo - Sistema de Vigilancia',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Prueba de correo electrónico</h2>
          <p>Este es un correo de prueba del Sistema de Vigilancia.</p>
          <p>Fecha y hora: ${new Date().toLocaleString()}</p>
        </div>
      `
    });
    
    console.log('Correo enviado correctamente:');
    console.log('- ID del mensaje:', info.messageId);
    console.log('- Respuesta del servidor:', info.response);
    
    return { success: true, info };
  } catch (error) {
    console.error('Error al enviar correo de prueba:');
    console.error(error);
    
    // Mostrar más detalles sobre el error
    if (error.code === 'EAUTH') {
      console.error('Error de autenticación. Verifica usuario y contraseña.');
    } else if (error.code === 'ESOCKET') {
      console.error('Error de conexión. Verifica host, puerto y configuración SSL/TLS.');
    }
    
    return { success: false, error };
  }
}

// Ejecutar la prueba si se llama directamente
if (require.main === module) {
  console.log('Iniciando prueba de correo electrónico...');
  testEmail()
    .then(() => {
      console.log('Prueba finalizada.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error en la prueba:', err);
      process.exit(1);
    });
}

module.exports = { testEmail };
