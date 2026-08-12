import { extraerArchivoDeAsunto, extraerIdentidadDeArchivo } from '../services/dropboxSignMailService.js';
const casos = [
    'Se inició el proceso de firma de 705_Contrato_Braun_Diego_Martín_diegonanomartin_gmail.com_CUIL-23232274409_DNI-23227440',
    'Se inició el proceso de firma de Testing Weprodu',
    'Gimena Accardi firmó 703_JSA_ALTA_2026_JULIO...',
    'Recibiste un documento a través de Dropbox Sign',
    'Se inició el proceso de firma de 426_Contrato_Perez_Ana_ana_mail.com_CUIL-27433210994_PAS-AB1234.pdf',
];
for (const a of casos) {
    const arch = extraerArchivoDeAsunto(a);
    console.log(`\nasunto : ${a.slice(0, 70)}`);
    console.log(`archivo: ${arch || '(no es aviso de envío)'}`);
    if (arch)
        console.log('ident  :', JSON.stringify(extraerIdentidadDeArchivo(arch)));
}
