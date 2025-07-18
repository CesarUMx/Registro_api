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
          
          <p>Si no espera esta visita o tiene alguna pregunta, por favor contacte al departamento de seguridad.</p>
          
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

module.exports = {
  enviarAlertaVisita,
  enviarNotificacionSalida,
  enviarAlertaVisitantesDemorados
};
