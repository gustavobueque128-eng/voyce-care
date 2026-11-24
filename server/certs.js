/* Certificados HTTPS para a rede local.
   Cria uma autoridade certificadora (CA) própria do Voyce Care, uma única vez. O celular/tablet instala o
   certificado da CA (voyce-ca.crt) e passa a confiar no servidor sem avisos — requisito do navegador para o
   microfone funcionar fora do computador.
   O nome usado pelos aparelhos é <ip-com-hifens>.sslip.io, que o DNS público sslip.io resolve para o IP local. */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const forge = require("node-forge");
const pki = forge.pki;

const isPrivate = ip => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
export function lanIPs() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === "IPv4" && !i.internal && isPrivate(i.address)).map(i => i.address)
    .sort((a, b) => (b.startsWith("192.168.") - a.startsWith("192.168.")));
}
export const sslipName = ip => ip.replace(/\./g, "-") + ".sslip.io";
export const HOST = os.hostname().toLowerCase();

const serial = () => "01" + crypto.randomBytes(15).toString("hex");
const years = (d, n) => { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; };
const days = (d, n) => new Date(d.getTime() + n * 86400e3);

function loadOrCreateCA(dir) {
  const keyF = path.join(dir, "ca-key.pem"), crtF = path.join(dir, "ca.pem");
  if (fs.existsSync(keyF) && fs.existsSync(crtF)) return { key: pki.privateKeyFromPem(fs.readFileSync(keyF, "utf8")), cert: pki.certificateFromPem(fs.readFileSync(crtF, "utf8")) };
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = serial();
  cert.validity.notBefore = days(new Date(), -1); cert.validity.notAfter = years(new Date(), 10);
  const attrs = [{ name: "commonName", value: `Voyce Care CA (${HOST})` }, { name: "organizationName", value: "Voyce Care - rede local" }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
    { name: "subjectKeyIdentifier" }
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyF, pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
  fs.writeFileSync(crtF, pki.certificateToPem(cert));
  return { key: keys.privateKey, cert };
}

/* Retorna { key, cert, ca, names, ips } prontos para o https.createServer. */
export function ensureCertificates(dir) {
  const ca = loadOrCreateCA(dir);
  const ips = lanIPs();
  const dns = ["localhost", HOST, HOST + ".local", ...ips.map(sslipName)];
  const allIps = ["127.0.0.1", ...ips];
  const keyF = path.join(dir, "server-key.pem"), crtF = path.join(dir, "server.pem"), metaF = path.join(dir, "server.json");
  let reuse = false;
  try {
    const meta = JSON.parse(fs.readFileSync(metaF, "utf8"));
    const cert = pki.certificateFromPem(fs.readFileSync(crtF, "utf8"));
    reuse = dns.every(n => meta.dns.includes(n)) && allIps.every(n => meta.ips.includes(n))
      && cert.validity.notAfter.getTime() - Date.now() > 30 * 86400e3 && ca.cert.verify(cert);
  } catch (e) { reuse = false; }
  if (!reuse) {
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = serial();
    cert.validity.notBefore = days(new Date(), -1); cert.validity.notAfter = days(new Date(), 397);
    cert.setSubject([{ name: "commonName", value: ips[0] ? sslipName(ips[0]) : "localhost" }, { name: "organizationName", value: "Voyce Care" }]);
    cert.setIssuer(ca.cert.subject.attributes);
    cert.setExtensions([
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [...dns.map(value => ({ type: 2, value })), ...allIps.map(ip => ({ type: 7, ip }))] },
      { name: "subjectKeyIdentifier" },
      { name: "authorityKeyIdentifier", keyIdentifier: ca.cert.generateSubjectKeyIdentifier().getBytes() }
    ]);
    cert.sign(ca.key, forge.md.sha256.create());
    fs.writeFileSync(keyF, pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
    fs.writeFileSync(crtF, pki.certificateToPem(cert));
    fs.writeFileSync(metaF, JSON.stringify({ dns, ips: allIps, criado: new Date().toISOString() }, null, 1));
  }
  const caPem = pki.certificateToPem(ca.cert);
  return {
    key: fs.readFileSync(keyF, "utf8"),
    cert: fs.readFileSync(crtF, "utf8") + caPem, // cadeia completa
    caPem, caDer: Buffer.from(forge.asn1.toDer(pki.certificateToAsn1(ca.cert)).getBytes(), "binary"),
    ips, dns
  };
}
