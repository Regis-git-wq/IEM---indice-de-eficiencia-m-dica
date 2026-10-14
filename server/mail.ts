import nodemailer from "nodemailer";

// Ex.: SMTP_URL=smtps://usuario:senha@smtp.gmail.com:465 (Gmail com "senha de app"),
// ou o SMTP de serviços como Resend, Brevo, Mailgun, SendGrid.
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const from = process.env.MAIL_FROM ?? "Resumi <nao-responda@resumi.app>";

export const mailConfigured = transport !== null;

if (!transport) {
  console.warn("[mail] SMTP_URL não configurado: e-mails de recuperação de senha não serão enviados.");
}

export async function sendPasswordResetEmail(to: string, name: string, link: string) {
  if (!transport) {
    // Em desenvolvimento, mostra o link no terminal para poder testar sem servidor de e-mail.
    if (process.env.NODE_ENV !== "production") console.info(`[mail] Link de redefinição para ${to}: ${link}`);
    return;
  }
  await transport.sendMail({
    from,
    to,
    subject: "Redefinir sua senha do Resumi",
    text: `Olá, ${name}!\n\nRecebemos um pedido para redefinir a sua senha do Resumi. Para criar uma nova senha, abra o link abaixo (válido por 1 hora):\n\n${link}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.`,
    html: `<p>Olá, ${escapeHtml(name)}!</p>
<p>Recebemos um pedido para redefinir a sua senha do Resumi.</p>
<p><a href="${escapeHtml(link)}">Criar uma nova senha</a> (link válido por 1 hora)</p>
<p>Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
