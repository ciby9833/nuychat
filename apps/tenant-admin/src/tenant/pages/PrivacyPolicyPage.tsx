import { Button, Divider, Typography } from "antd";
import { Link } from "react-router-dom";

const UPDATED_AT = "June 15, 2026";

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="privacy-section">
      <Typography.Title level={3}>{props.title}</Typography.Title>
      <div className="privacy-copy">{props.children}</div>
    </section>
  );
}

export function PrivacyPolicyPage() {
  return (
    <main className="privacy-page">
      <article className="privacy-document">
        <header className="privacy-header">
          <Typography.Text className="privacy-brand">PT Global Jet Supply Chain</Typography.Text>
          <Typography.Title level={1}>Privacy Policy</Typography.Title>
          <Typography.Paragraph>
            This privacy policy explains how PT Global Jet Supply Chain, operating J&amp;T Cargo Indonesia services, processes personal information when customers contact us through WhatsApp Business and other customer service channels.
          </Typography.Paragraph>
          <Typography.Text type="secondary">Last updated: {UPDATED_AT}</Typography.Text>
        </header>

        <Divider />

        <Section title="1. Scope">
          <p>
            This policy applies to customers, shippers, recipients, business partners, website visitors, and other users who communicate with PT Global Jet Supply Chain or J&amp;T Cargo Indonesia through WhatsApp Business or related customer service channels.
          </p>
          <p>
            Our customer service tools help authorized staff receive, manage, and respond to customer inquiries about shipments, logistics services, complaints, claims, business cooperation, and related support requests.
          </p>
        </Section>

        <Section title="2. Information We Process">
          <p>Depending on your interaction with us, we may process the following categories of information:</p>
          <ul>
            <li>Contact information, such as your name, phone number, WhatsApp account identifier, company name, and contact details you provide.</li>
            <li>Shipment and service information, such as waybill number, pickup or delivery details, shipment status inquiries, complaint details, claim information, and related logistics records.</li>
            <li>WhatsApp conversation information, including message content, message ID, timestamp, sender information, display name or profile name when provided by WhatsApp, attachments, contact cards, location messages, reactions, delivery/read status, and related technical metadata.</li>
            <li>Customer service records, including conversation history, case status, assigned service staff, follow-up tasks, quality review records, and support resolution notes.</li>
            <li>Technical and security information, such as device or browser metadata, access logs, system events, and information needed to protect, operate, audit, and troubleshoot our services.</li>
          </ul>
        </Section>

        <Section title="3. How WhatsApp Data Is Used">
          <p>
            WhatsApp data is used to provide customer service and logistics support. This includes receiving inbound messages, showing conversations to authorized staff, sending replies, checking shipment information, assigning conversations to service staff, maintaining delivery status, handling attachments and reactions, following up on unresolved cases, monitoring service quality, and keeping conversation history for support and audit purposes.
          </p>
          <p>
            We do not sell WhatsApp user data. We do not use WhatsApp message content for third-party advertising. We do not share WhatsApp data with unrelated third parties except where necessary to provide customer service, operate secure systems, comply with law, protect rights and safety, or work with service providers under appropriate confidentiality and data protection obligations.
          </p>
        </Section>

        <Section title="4. Legal Basis">
          <p>
            We process personal information where it is necessary to provide requested logistics and customer support services, perform or prepare a contract, respond to customer requests, comply with legal obligations, protect our rights and systems, improve service quality, or where you have provided consent as required by applicable law.
          </p>
        </Section>

        <Section title="5. Access Control and Security">
          <p>
            Customer service management pages are restricted to authorized staff. Protected pages require login, and system access is controlled by account status, role, session validation, and route permissions.
          </p>
          <p>
            We use organizational, technical, and access control measures designed to protect customer information from unauthorized access, disclosure, alteration, or loss. WhatsApp webhook requests and channel operations are protected through verification mechanisms and security checks where configured.
          </p>
          <p>
            No method of transmission or storage is completely secure. We continuously work to maintain appropriate safeguards based on the nature of the information and the risks involved.
          </p>
        </Section>

        <Section title="6. Data Sharing">
          <p>We may share data only in limited situations, including:</p>
          <ul>
            <li>With authorized staff and affiliated operational teams who need the information to provide logistics and customer support services.</li>
            <li>With Meta/WhatsApp as required to receive and send WhatsApp Business messages.</li>
            <li>With technology, hosting, storage, security, analytics, communications, and customer service providers that support our operations.</li>
            <li>With logistics partners or business partners where necessary to process shipments, resolve service issues, or respond to your request.</li>
            <li>When required by law, regulation, legal process, or to protect rights, safety, and security.</li>
          </ul>
        </Section>

        <Section title="7. Retention and Deletion">
          <p>
            We keep customer service and WhatsApp conversation data for as long as needed to provide support, process shipments, resolve disputes, meet audit and legal obligations, protect our systems, and improve service quality. Retention periods may vary depending on the type of record and applicable operational or legal requirements.
          </p>
          <p>
            You may request access, correction, or deletion of your personal information by contacting PT Global Jet Supply Chain or J&amp;T Cargo Indonesia through our official customer service channels. Some information may need to be retained where required by law, dispute handling, fraud prevention, security, or legitimate business records.
          </p>
        </Section>

        <Section title="8. International Processing">
          <p>
            We and our service providers may process information in Indonesia or other countries where our systems, service providers, or support operations are located. Where required, we use appropriate contractual, technical, and organizational safeguards for such processing.
          </p>
        </Section>

        <Section title="9. Children">
          <p>
            Our logistics and customer service channels are not directed to children. We do not knowingly collect personal information from children without appropriate authorization.
          </p>
        </Section>

        <Section title="10. Changes">
          <p>
            We may update this policy when the product, legal requirements, or data processing practices change. The updated date above indicates the latest version.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            For privacy requests or questions, please contact PT Global Jet Supply Chain through our official customer service channels or the WhatsApp Business account through which you communicated with us.
          </p>
        </Section>

        <Divider />

        <section className="privacy-section privacy-zh">
          <Typography.Title level={2}>Ringkasan Kebijakan Privasi</Typography.Title>
          <p>
            Kebijakan ini menjelaskan bagaimana PT Global Jet Supply Chain, yang mengoperasikan layanan J&amp;T Cargo Indonesia, memproses informasi pribadi ketika pelanggan menghubungi kami melalui WhatsApp Business dan kanal layanan pelanggan lainnya.
          </p>
          <p>
            Informasi yang dapat diproses mencakup nama, nomor telepon, identitas WhatsApp, isi percakapan, lampiran, lokasi yang Anda kirimkan, nomor resi, informasi pengiriman, status layanan, catatan keluhan, serta metadata teknis yang diperlukan untuk menjalankan dan mengamankan layanan.
          </p>
          <p>
            Data WhatsApp digunakan untuk menerima dan membalas pesan pelanggan, memeriksa status pengiriman, menangani keluhan, menugaskan staf layanan, menjaga kualitas layanan, dan menyimpan riwayat dukungan. Kami tidak menjual data pengguna WhatsApp dan tidak menggunakan isi pesan WhatsApp untuk iklan pihak ketiga.
          </p>
          <p>
            Untuk permintaan akses, koreksi, atau penghapusan data pribadi, silakan hubungi PT Global Jet Supply Chain melalui kanal layanan pelanggan resmi kami.
          </p>
        </section>

        <footer className="privacy-footer">
          <Button type="primary">
            <Link to="/">Staff Login</Link>
          </Button>
        </footer>
      </article>
    </main>
  );
}
