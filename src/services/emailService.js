// src/services/emailService.js
const transporter = require('../config/emailConfig');

/**
 * Envía un correo electrónico de alerta a una persona que será visitada
 * @param {string} email - Correo electrónico del destinatario
 * @param {string} nombreDestinatario - Nombre de la persona a visitar
 * @param {Array} visitantes - Lista de visitantes
 * @param {string} edificio - Edificio donde se realizará la visita
 * @param {string} motivo - Motivo de la visita
 * @param {string} codigoRegistro - Código de registro de la visita
 * @returns {Promise} - Promesa que se resuelve cuando se envía el correo
 */
async function enviarAlertaVisita(email, nombreDestinatario, visitantes, edificio, motivo, codigoRegistro) {
  try {
    // Generar la lista de visitantes en HTML
    let visitantesHtml = '';
    if (Array.isArray(visitantes) && visitantes.length > 0) {
      visitantesHtml = `
        <p><strong>Visitantes:</strong></p>
        <ul style="list-style-type: disc; padding-left: 20px;">
      `;
      
      visitantes.forEach(visitante => {
        visitantesHtml += `<li>${visitante}</li>`;
      });
      
      visitantesHtml += '</ul>';
    } else if (typeof visitantes === 'string') {
      // Si solo se proporciona un visitante como string
      visitantesHtml = `<p><strong>Visitante:</strong> ${visitantes}</p>`;
    } else {
      visitantesHtml = '<p><strong>Visitante:</strong> No especificado</p>';
    }
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'sistema.vigilancia@umx.com',
      to: email,
      subject: 'Alerta de Visita - Sistema de Vigilancia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px;">Notificación de Visita</h2>
          
          <p>Estimado(a) <strong>${nombreDestinatario}</strong>,</p>
          
          <p>Le informamos que se ha registrado una visita para usted.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Detalles de la visita:</strong></p>
            <ul style="list-style-type: none; padding-left: 5px;">
              <li><strong>Edificio:</strong> ${edificio}</li>
              <li><strong>Motivo:</strong> ${motivo}</li>
              <li><strong>Código de registro:</strong> ${codigoRegistro}</li>
              <li><strong>Fecha y hora de registro:</strong> ${new Date().toLocaleString()}</li>
            </ul>
            
            ${visitantesHtml}
          </div>
          
          <p>Si no espera esta visita o tiene alguna pregunta, por favor contacte al departamento de seguridad a la extecion: 1892.</p>
          
          <p style="font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
            Este es un mensaje automático del Sistema de Vigilancia. Por favor no responda a este correo.
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Correo de alerta enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de alerta:', error);
    throw error;
  }
}

/**
 * Envía un correo electrónico de notificación de salida de visitantes
 * @param {string} email - Correo electrónico del destinatario
 * @param {string} nombreDestinatario - Nombre de la persona visitada
 * @param {Array} visitantes - Lista de visitantes que salieron
 * @param {string} edificio - Edificio donde se realizó la visita
 * @param {string} codigoRegistro - Código de registro de la visita
 * @param {string} notas - Notas adicionales sobre la salida
 * @returns {Promise} - Promesa que se resuelve cuando se envía el correo
 */
async function enviarNotificacionSalida(email, nombreDestinatario, visitantes, edificio, codigoRegistro, notas = '', lugar = 'l edificio') {
  try {
    // Generar la lista de visitantes en HTML
    let visitantesHtml = '';
    if (Array.isArray(visitantes) && visitantes.length > 0) {
      visitantesHtml = `
        <p><strong>Visitantes que han salido:</strong></p>
        <ul style="list-style-type: disc; padding-left: 20px;">
      `;
      
      visitantes.forEach(visitante => {
        visitantesHtml += `<li>${visitante}</li>`;
      });
      
      visitantesHtml += '</ul>';
    } else if (typeof visitantes === 'string') {
      // Si solo se proporciona un visitante como string
      visitantesHtml = `<p><strong>Visitante que ha salido:</strong> ${visitantes}</p>`;
    } else {
      visitantesHtml = '<p><strong>Visitante:</strong> No especificado</p>';
    }
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'sistema.vigilancia@umx.com',
      to: email,
      subject: 'Notificación de Salida - Sistema de Vigilancia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px;">Notificación de Salida</h2>
          
          <p>Estimado(a) <strong>${nombreDestinatario}</strong>,</p>
          
          <p>Le informamos que los siguientes visitantes han salido de ${lugar}.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Detalles de la salida:</strong></p>
            <ul style="list-style-type: none; padding-left: 5px;">
              <li><strong>Edificio:</strong> ${edificio}</li>
              <li><strong>Código de registro:</strong> ${codigoRegistro}</li>
              <li><strong>Fecha y hora de salida:</strong> ${new Date().toLocaleString()}</li>
              ${notas ? `<li><strong>Notas:</strong> ${notas}</li>` : ''}
            </ul>
            
            ${visitantesHtml}
          </div>
          
          <p style="font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
            Este es un mensaje automático del Sistema de Vigilancia. Por favor no responda a este correo.
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Correo de notificación de salida enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de notificación de salida:', error);
    throw error;
  }
}

/**
 * Envía un correo electrónico de alerta para visitantes que salieron del edificio pero no han salido por caseta
 * @param {string} email - Correo electrónico del destinatario
 * @param {string} nombreDestinatario - Nombre de la persona visitada
 * @param {Array} visitantes - Lista de visitantes que no han salido por caseta
 * @param {string} edificio - Edificio donde se realizó la visita
 * @param {string} codigoRegistro - Código de registro de la visita
 * @returns {Promise} - Promesa que se resuelve cuando se envía el correo
 */
async function enviarAlertaVisitantesDemorados(email, nombreDestinatario, visitantes, edificio, codigoRegistro) {
  try {
    // Generar la lista de visitantes en HTML
    let visitantesHtml = '';
    if (Array.isArray(visitantes) && visitantes.length > 0) {
      visitantesHtml = `
        <p><strong>Visitantes que aún no han salido por caseta:</strong></p>
        <ul style="list-style-type: disc; padding-left: 20px;">
      `;
      
      visitantes.forEach(visitante => {
        // Si el visitante es un objeto con propiedad 'nombre', usar esa propiedad
        if (typeof visitante === 'object' && visitante !== null && visitante.nombre) {
          visitantesHtml += `<li><strong>${visitante.nombre}</strong> con <strong>${visitante.minutos}</strong> minutos de demora</li>`;
        } else {
          // Si es un string u otro tipo, convertirlo a string
          visitantesHtml += `<li><strong>${String(visitante)}</strong> con <strong>${visitante.minutos}</strong> minutos de demora</li>`;
        }
      });
      
      visitantesHtml += '</ul>';
    } else if (typeof visitantes === 'string') {
      // Si solo se proporciona un visitante como string
      visitantesHtml = `<p><strong>Visitante que aún no ha salido por caseta:</strong> <strong>${visitantes}</strong> con <strong>${visitantes.minutos}</strong> minutos de demora</p>`;
    } else if (typeof visitantes === 'object' && visitantes !== null && visitantes.nombre) {
      // Si es un solo objeto visitante
      visitantesHtml = `<p><strong>Visitante que aún no ha salido por caseta:</strong> <strong>${visitantes.nombre}</strong> con <strong>${visitantes.minutos}</strong> minutos de demora</p>`;
    } else {
      visitantesHtml = '<p><strong>Visitante:</strong> No especificado</p>';
    }
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'sistema.vigilancia@umx.com',
      to: email,
      subject: 'Alerta: Visitantes sin salir por caseta - Sistema de Vigilancia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #c00; border-bottom: 1px solid #eee; padding-bottom: 10px;">Alerta de Seguridad</h2>
          
          <p>Estimado(a) <strong>${nombreDestinatario}</strong>,</p>
          
          <p>Le informamos que los siguientes visitantes salieron del edificio pero aún no han registrado su salida por caseta.</p>
          
          <div style="background-color: #fff9f9; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #c00;">
            <p><strong>Detalles de la alerta:</strong></p>
            <ul style="list-style-type: none; padding-left: 5px;">
              <li><strong>Edificio:</strong> ${edificio}</li>
              <li><strong>Código de registro:</strong> ${codigoRegistro}</li>
              <li><strong>Fecha y hora de la alerta:</strong> ${new Date().toLocaleString()}</li>
            </ul>
            
            ${visitantesHtml}
          </div>
          
          <p>Por favor, verifique la ubicación de estos visitantes o contacte al departamento de seguridad si considera necesario.</p>
          
          <p style="font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
            Este es un mensaje automático del Sistema de Vigilancia. Por favor no responda a este correo.
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Correo de alerta de visitantes demorados enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de alerta de visitantes demorados:', error);
    throw error;
  }
}

/**
 * Envía un correo electrónico con los datos del preregistro y código QR
 * @param {string} email - Correo electrónico del destinatario
 * @param {Object} preregistro - Datos del preregistro
 * @param {Array} visitantes - Lista de visitantes
 * @param {Array} vehiculos - Lista de vehículos
 * @returns {Promise} - Promesa que se resuelve cuando se envía el correo
 */
async function enviarPreregistroQR(email, preregistro, visitantes = [], vehiculos = []) {
  try {
    console.log('📧 Iniciando envío de correo de preregistro...');
    console.log('Destinatario:', email);
    console.log('Preregistro ID:', preregistro.id);
    console.log('Código:', preregistro.codigo);
    // Formatear fechas
    const fechaEntrada = new Date(preregistro.scheduled_entry_time).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const fechaSalida = new Date(preregistro.scheduled_exit_time).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Generar lista de visitantes en HTML
    let visitantesHtml = '';
    if (visitantes.length > 0) {
      visitantesHtml = `
        <div style="background-color: #f0f8ff; padding: 15px; border-radius: 5px; margin: 10px 0;">
          <h4 style="color: #2c5aa0; margin-top: 0;">👥 Visitantes:</h4>
          <ul style="list-style-type: none; padding-left: 0;">
      `;
      
      visitantes.forEach(visitante => {
        visitantesHtml += `
          <li style="margin-bottom: 8px; padding: 8px; background-color: white; border-radius: 3px;">
            <strong>${visitante.nombre}</strong><br>
            ${visitante.empresa ? `<span style="color: #666;">Empresa: ${visitante.empresa}</span><br>` : ''}
            ${visitante.telefono ? `<span style="color: #666;">Teléfono: ${visitante.telefono}</span>` : ''}
          </li>
        `;
      });
      
      visitantesHtml += '</ul></div>';
    }

    // Generar lista de vehículos en HTML
    let vehiculosHtml = '';
    if (vehiculos.length > 0) {
      vehiculosHtml = `
        <div style="background-color: #f0fff0; padding: 15px; border-radius: 5px; margin: 10px 0;">
          <h4 style="color: #2d5a2d; margin-top: 0;">🚗 Vehículos:</h4>
          <ul style="list-style-type: none; padding-left: 0;">
      `;
      
      vehiculos.forEach(vehiculo => {
        vehiculosHtml += `
          <li style="margin-bottom: 8px; padding: 8px; background-color: white; border-radius: 3px;">
            <strong>Placas: ${vehiculo.placa}</strong>
          </li>
        `;
      });
      
      vehiculosHtml += '</ul></div>';
    }
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'sistemas@mondragonmexico.edu.mx',
      to: email,
      subject: `Preregistro Confirmado - Código: ${preregistro.codigo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #fafafa;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c5aa0; margin-bottom: 10px;">✅ Preregistro Confirmado</h1>
            <p style="color: #666; font-size: 16px;">Su preregistro ha sido procesado exitosamente</p>
          </div>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2c5aa0;">
            <h3 style="color: #2c5aa0; margin-top: 0;">📋 Detalles del Preregistro</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">Código:</td>
                <td style="padding: 8px 0; color: #666;">${preregistro.codigo}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">Entrada programada:</td>
                <td style="padding: 8px 0; color: #666;">${fechaEntrada}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">Salida programada:</td>
                <td style="padding: 8px 0; color: #666;">${fechaSalida}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">Motivo:</td>
                <td style="padding: 8px 0; color: #666;">${preregistro.reason}</td>
              </tr>
            </table>
          </div>
          
          ${visitantesHtml}
          ${vehiculosHtml}
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="color: #856404; margin-top: 0;">🔢 Código de Acceso</h3>
            <div style="background-color: white; padding: 15px; border-radius: 5px; font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #2c5aa0; letter-spacing: 2px;">
              ${preregistro.codigo}
            </div>
            <p style="color: #856404; margin-bottom: 0; font-size: 14px;">Presente este código al llegar a las instalaciones</p>
          </div>
          
          <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <h4 style="color: #0c5460; margin-top: 0;">📌 Instrucciones Importantes:</h4>
            <ul style="color: #0c5460; margin-bottom: 0; padding-left: 20px;">
              <li>Llegue puntualmente en el horario programado</li>
              <li>Presente una identificación oficial</li>
              <li>Mencione el código de preregistro en la caseta de vigilancia</li>
              <li>Este preregistro es válido únicamente para la fecha y hora especificadas</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 12px; margin: 0;">Sistema de Vigilancia - UMx</p>
          </div>
        </div>
      `
    };

    console.log('📤 Enviando correo con transporter...');
    console.log('Configuración del correo:');
    console.log('- From:', mailOptions.from);
    console.log('- To:', mailOptions.to);
    console.log('- Subject:', mailOptions.subject);
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo de preregistro enviado exitosamente!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    return info;
    
  } catch (error) {
    console.error('❌ Error detallado al enviar correo de preregistro:');
    console.error('Tipo de error:', error.name);
    console.error('Mensaje:', error.message);
    console.error('Código:', error.code);
    console.error('Stack completo:', error.stack);
    
    if (error.response) {
      console.error('Respuesta del servidor:', error.response);
    }
    
    throw error;
  }
}

/**
 * Envía un correo electrónico con el link único para completar preregistro
 * @param {string} email - Correo electrónico del visitante
 * @param {string} token - Token único para el preregistro
 * @param {Object} preregistro - Datos básicos del preregistro
 * @returns {Promise} - Promesa que se resuelve cuando se envía el correo
 */
async function enviarLinkUnicoPreregistro(email, token, preregistro) {
  try {
    console.log('📧 Iniciando envío de correo con link único...');
    console.log('Destinatario:', email);
    console.log('Token:', token);
    console.log('Preregistro código:', preregistro.codigo);

    // Formatear fechas
    const fechaEntrada = new Date(preregistro.scheduled_entry_time).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const fechaSalida = new Date(preregistro.scheduled_exit_time).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Generar el link completo
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const linkCompleto = `${baseUrl}/preregistro/publico/${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER || 'sistema.vigilancia@umx.com',
      to: email,
      subject: 'Complete su Preregistro - Sistema de Vigilancia UMx',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #ffffff;">
          
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #0c5460;">
            <h1 style="color: #0c5460; margin: 0; font-size: 24px;">🔗 Complete su Preregistro</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Sistema de Vigilancia - UMx</p>
          </div>

          <!-- Saludo -->
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            Estimado visitante,
          </p>

          <p style="font-size: 16px; color: #333; margin-bottom: 25px;">
            Se ha creado un preregistro para su visita a las instalaciones de UMx. Para completar el proceso, 
            necesitamos que proporcione algunos datos adicionales.
          </p>

          <!-- Información del preregistro -->
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0c5460;">
            <h3 style="color: #0c5460; margin-top: 0; margin-bottom: 15px;">📋 Detalles de su visita:</h3>
            <ul style="list-style-type: none; padding-left: 0; margin: 0;">
              <li style="margin-bottom: 8px;"><strong>📅 Fecha y hora de entrada:</strong> ${fechaEntrada}</li>
              <li style="margin-bottom: 8px;"><strong>🚪 Fecha y hora de salida:</strong> ${fechaSalida}</li>
              <li style="margin-bottom: 8px;"><strong>📝 Motivo:</strong> ${preregistro.reason}</li>
              <li style="margin-bottom: 8px;"><strong>🔢 Código de preregistro:</strong> <span style="background-color: #e3f2fd; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${preregistro.codigo}</span></li>
            </ul>
          </div>

          <!-- Link único -->
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center; border: 2px solid #4caf50;">
            <h3 style="color: #2e7d32; margin-top: 0; margin-bottom: 15px;">🔗 Complete su preregistro aquí:</h3>
            <a href="${linkCompleto}" 
               style="display: inline-block; background-color: #4caf50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; margin: 10px 0;">
              COMPLETAR PREREGISTRO
            </a>
            <p style="font-size: 12px; color: #666; margin-top: 15px; word-break: break-all;">
              Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
              <span style="background-color: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${linkCompleto}</span>
            </p>
          </div>

          <!-- Instrucciones -->
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
            <h3 style="color: #856404; margin-top: 0; margin-bottom: 15px;">📝 Instrucciones para completar:</h3>
            <ol style="color: #856404; margin: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Haga clic en el enlace de arriba</li>
              <li style="margin-bottom: 8px;">Complete sus datos personales (nombre, teléfono, empresa)</li>
              <li style="margin-bottom: 8px;">Suba una foto de su INE (identificación oficial)</li>
              <li style="margin-bottom: 8px;">Si viene en vehículo, agregue los datos del mismo</li>
              <li style="margin-bottom: 8px;">Suba una foto de la placa del vehículo (si aplica)</li>
              <li style="margin-bottom: 0;">Confirme y envíe la información</li>
            </ol>
          </div>

          <!-- Información importante -->
          <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #dc3545;">
            <h3 style="color: #721c24; margin-top: 0; margin-bottom: 15px;">⚠️ Información importante:</h3>
            <ul style="color: #721c24; margin: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Este enlace es único y personal, no lo comparta</li>
              <li style="margin-bottom: 8px;">Debe completar el formulario antes de su visita</li>
              <li style="margin-bottom: 8px;">Llegue puntualmente en el horario programado</li>
              <li style="margin-bottom: 8px;">Presente una identificación oficial en la caseta</li>
              <li style="margin-bottom: 0;">Mencione el código de preregistro: <strong>${preregistro.codigo}</strong></li>
            </ul>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              Este es un mensaje automático del Sistema de Vigilancia UMx.<br>
              Por favor no responda a este correo.
            </p>
          </div>
        </div>
      `
    };

    console.log('📤 Enviando correo con link único...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo con link único enviado exitosamente!');
    console.log('Message ID:', info.messageId);
    return info;
    
  } catch (error) {
    console.error('❌ Error al enviar correo con link único:', error);
    throw error;
  }
}

/**
 * Envía un correo electrónico de alerta al creador del preregistro cuando está próximo a expirar
 * @param {string} email - Correo electrónico del creador del preregistro
 * @param {string} nombreAdmin - Nombre del administrador que creó el preregistro
 * @param {string} codigoPreregistro - Código del preregistro
 * @param {string} motivo - Motivo de la visita
 * @param {Date} fechaExpiracion - Fecha y hora de expiración del preregistro
 * @returns {Promise} - Promesa que se resuelve cuando se envía el correo
 */
async function enviarAlertaPreregistroProximoExpirar(email, nombreAdmin, codigoPreregistro, motivo, fechaExpiracion) {
  try {
    const fechaFormateada = new Date(fechaExpiracion).toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const mailOptions = {
      from: process.env.EMAIL_USER || 'sistema.vigilancia@umx.com',
      to: email,
      subject: `⚠️ Alerta: Preregistro ${codigoPreregistro} próximo a expirar`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #ff4d00; border-bottom: 1px solid #eee; padding-bottom: 10px;">Alerta de Preregistro Próximo a Expirar</h2>
          
          <p>Estimado(a) <strong>${nombreAdmin}</strong>,</p>
          
          <p>Le informamos que un preregistro creado por usted está próximo a expirar en <strong>15 minutos</strong>.</p>
          
          <div style="background-color: #fff4e6; padding: 15px; border-left: 4px solid #ff4d00; border-radius: 5px; margin: 15px 0;">
            <p><strong>Detalles del preregistro:</strong></p>
            <ul style="list-style-type: none; padding-left: 5px;">
              <li><strong>Código:</strong> ${codigoPreregistro}</li>
              <li><strong>Motivo:</strong> ${motivo}</li>
              <li><strong>Expira el:</strong> ${fechaFormateada}</li>
            </ul>
          </div>
          
          <p>Si el visitante aún no se a retirado, considere extender la fecha de expiración o crear un nuevo preregistro.</p>
          
          <p style="font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
            Este es un mensaje automático del Sistema de Vigilancia. Por favor no responda a este correo.
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Correo de alerta de preregistro próximo a expirar enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de alerta de preregistro próximo a expirar:', error);
    throw error;
  }
}

/**
 * Envía un correo electrónico con las credenciales de acceso a un nuevo usuario
 * @param {string} email - Correo electrónico del usuario
 * @param {string} nombre - Nombre del usuario
 * @param {string} username - Nombre de usuario para acceder al sistema
 * @param {string} password - Contraseña generada para el usuario
 * @returns {Promise} - Promesa que se resuelve cuando se envía el correo
 */
async function enviarCredencialesUsuario(email, nombre, username, password) {
  try {
    console.log('📧 Iniciando envío de credenciales a nuevo usuario...');
    console.log('Destinatario:', email);
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'sistemas@mondragonmexico.edu.mx',
      to: email,
      subject: 'Credenciales de Acceso - Sistema de Control de Acceso de Visitas',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #fafafa;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #004987; margin-bottom: 10px;">Bienvenido al Sistema de Control de Acceso de Visitas</h1>
            <p style="color: #666; font-size: 16px;">Se ha creado una cuenta para ti en el Sistema de Control de Acceso de Visitas de UMx</p>
          </div>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #004987;">
            <h3 style="color: #004987; margin-top: 0;">👤 Tus Credenciales de Acceso</h3>
            <p>Hola <strong>${nombre}</strong>,</p>
            <p>Te damos la bienvenida al Sistema de Control de Acceso de Visitas de la Universidad Mondragón México. A continuación, encontrarás tus credenciales de acceso:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background-color: #f0f8ff;">
                <td style="padding: 12px; font-weight: bold; color: #333; border: 1px solid #ddd;">Usuario:</td>
                <td style="padding: 12px; color: #666; border: 1px solid #ddd;"><strong>${username}</strong></td>
              </tr>
              <tr>
                <td style="padding: 12px; font-weight: bold; color: #333; border: 1px solid #ddd;">Contraseña:</td>
                <td style="padding: 12px; color: #666; border: 1px solid #ddd;"><strong>${password}</strong></td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #856404; margin-top: 0;">🔐 Instrucciones de Acceso:</h4>
            <ol style="color: #856404; margin-bottom: 0;">
              <li>Ingresa a la plataforma a través del siguiente enlace: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="color: #004987;">Sistema de Control de Acceso de Visitas</a></li>
              <li>Utiliza las credenciales proporcionadas para iniciar sesión</li>
            </ol>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #999; font-size: 12px; margin: 0;">Sistema de Control de Acceso de Visitas - Universidad Mondragón México</p>
          </div>
        </div>
      `
    };

    console.log('📤 Enviando correo con transporter...');
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo de credenciales enviado exitosamente!');
    console.log('Message ID:', info.messageId);
    return info;
    
  } catch (error) {
    console.error('❌ Error al enviar correo de credenciales:', error);
    throw error;
  }
}

module.exports = {
  enviarAlertaVisita,
  enviarNotificacionSalida,
  enviarAlertaVisitantesDemorados,
  enviarPreregistroQR,
  enviarLinkUnicoPreregistro,
  enviarAlertaPreregistroProximoExpirar,
  enviarCredencialesUsuario
};
