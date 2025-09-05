// controllers/capturaController.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Mapear RTSP según tipo
const cameraMap = {
    placauni: 'rtsp://cav:Str34m.C4v@10.1.231.109:554',
    personauni: 'rtsp://cav:Str34m.C4v@10.1.231.108:554',
    ineuniedi: 'rtsp://cav:Str34m.C4v@10.1.231.133:554/Streaming/channels/101',
    ineunicaseta: 'rtsp://cav:Str34m.C4v@10.1.231.134:554/Streaming/channels/101',
    placaprepa: 'rtsp://cav:Str34m.C4v@10.1.231.107:554',
    personaprepa: 'rtsp://cav:Str34m.C4v@10.1.231.106:554',
};

async function capturarImagen(req, res) {
    const tipo = req.params.tipo;
    const rtspUrl = cameraMap[tipo];

    if (!rtspUrl) {
        return res.status(400).json({ ok: false, error: 'Tipo de cámara inválido' });
    }

    const filename = `${tipo}_${uuidv4()}.jpg`;

    const outputPath = path.join(__dirname, '..', '..', 'uploads', filename);

    ffmpeg(rtspUrl)
        .inputOptions(['-rtsp_transport', 'tcp'])
        .outputOptions(['-vframes 1', '-q:v 2', '-f image2'])
        .output(outputPath)
        .on('start', commandLine => {
            console.log('⚙️ Comando ffmpeg:', commandLine);
        })
        .on('end', () => {
            if (!fs.existsSync(outputPath)) {
                console.error('❌ Imagen no generada');
                return res.status(500).json({ ok: false, error: 'No se generó la imagen' });
            }
            console.log(`✅ Imagen capturada: ${filename}`);
            res.json({ ok: true, path: `/uploads/${filename}` });
        })
        .on('error', (err) => {
            console.error('❌ Error al capturar imagen:', err.message);
            res.status(500).json({ ok: false, error: err.message });
        })
        .run();


};

module.exports = { capturarImagen };
