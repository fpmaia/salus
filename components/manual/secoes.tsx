import type { ReactNode } from "react";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { PLANOS_PUBLICOS } from "@/src/domain/planos";

// Conteúdo do manual do usuário (/manual). Cada seção diz para quem é, o que resolve, o passo a
// passo com os nomes dos botões como aparecem na tela, prints e animações (gerados por
// `npm run manual:telas`) e os erros mais comuns. Ao mudar uma tela, atualize a seção e rode o script.

export type Perfil = "admin" | "recepcao" | "profissional" | "paciente" | "plataforma";

export const ROTULO_PERFIL: Record<Perfil, string> = {
  admin: "Administrador",
  recepcao: "Recepção",
  profissional: "Profissional",
  paciente: "Paciente",
  plataforma: "Equipe Salus",
};

export type Grupo = { id: string; titulo: string };

export const GRUPOS: Grupo[] = [
  { id: "inicio", titulo: "Comece aqui" },
  { id: "configurar", titulo: "Configurar o espaço" },
  { id: "dia-a-dia", titulo: "Agenda e recepção" },
  { id: "profissional", titulo: "Profissional" },
  { id: "dinheiro", titulo: "Contratos e financeiro" },
  { id: "controle", titulo: "Planos e controle" },
  { id: "paciente", titulo: "Paciente" },
  { id: "plataforma", titulo: "Equipe Salus" },
  { id: "ajuda", titulo: "Dúvidas" },
];

export type Midia = { tipo: "print"; nome: string; legenda: string } | { tipo: "animacao"; nome: string; legenda: string; celular?: boolean };

export type Secao = {
  id: string;
  grupo: string;
  titulo: string;
  resumo: string;
  perfis: Perfil[];
  /** Onde fica no sistema (texto do menu). */
  onde?: string;
  link?: string;
  passos?: ReactNode[];
  midias?: Midia[];
  conteudo?: ReactNode;
  dicas?: ReactNode[];
  problemas?: { sintoma: string; solucao: ReactNode }[];
  /** Palavras para a busca, além do texto da seção. */
  termos?: string[];
};

const b = (texto: string) => <strong className="font-semibold text-foreground">{texto}</strong>;

function TabelaPlanos() {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium" />
            {PLANOS_PUBLICOS.map((p) => (
              <th key={p.codigo} className="px-3 py-2 font-semibold text-foreground">
                {p.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr>
            <td className="px-3 py-2 text-muted-foreground">Mensalidade</td>
            {PLANOS_PUBLICOS.map((p) => (
              <td key={p.codigo} className="px-3 py-2 font-semibold">
                {formatarMoeda(p.precoMensalCentavos)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-3 py-2 text-muted-foreground">Unidades incluídas</td>
            {PLANOS_PUBLICOS.map((p) => (
              <td key={p.codigo} className="px-3 py-2">
                {p.limites.unidades.toLocaleString("pt-BR")} {p.permiteUnidadeExtra ? `(+${formatarMoeda(p.precoUnidadeExtraCentavos)} cada extra)` : "(sem unidade extra)"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-3 py-2 text-muted-foreground">Salas incluídas</td>
            {PLANOS_PUBLICOS.map((p) => (
              <td key={p.codigo} className="px-3 py-2">
                {p.limites.salas.toLocaleString("pt-BR")} (+{formatarMoeda(p.precoSalaExtraCentavos)} cada extra)
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-3 py-2 text-muted-foreground">Profissionais incluídos</td>
            {PLANOS_PUBLICOS.map((p) => (
              <td key={p.codigo} className="px-3 py-2">
                {p.limites.profissionais.toLocaleString("pt-BR")} (+{formatarMoeda(p.precoProfissionalExtraCentavos)} cada extra)
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-3 py-2 text-muted-foreground">Prontuário por profissional</td>
            {PLANOS_PUBLICOS.map((p) => (
              <td key={p.codigo} className="px-3 py-2">
                {formatarMoeda(p.precoProntuarioCentavos)}/mês após 15 dias grátis
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const PAPEIS: [string, string, string, string][] = [
  ["Agenda: ver, reservar sala, agendar paciente", "Sim", "Sim", "Só as próprias"],
  ["Check-in, falta, remarcar, lista de espera", "Sim", "Sim", "Só as próprias (sem lista de espera)"],
  ["Pacientes", "Todos", "Todos", "Só os que atende"],
  ["Exportar ou anonimizar paciente (LGPD)", "Sim", "Não", "Não"],
  ["Financeiro e fechamento do mês", "Sim (fecha)", "Consulta", "Só o próprio extrato"],
  ["Contratos", "Cria e reajusta", "Consulta", "Só o próprio"],
  ["Unidades, salas, feriados e módulos", "Sim", "Não", "Não"],
  ["Profissionais e convites", "Sim", "Sim", "Não"],
  ["Equipe (membros e papéis)", "Sim", "Não", "Não"],
  ["Notificações, WhatsApp e assinatura do Salus", "Sim", "Não", "Não"],
  ["Notas fiscais", "Configura e emite", "Consulta", "Não"],
  ["Prontuário (conteúdo clínico)", "Não lê", "Não lê", "Só o próprio"],
];

function TabelaPapeis() {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">O quê</th>
            <th className="px-3 py-2 font-semibold text-foreground">Administrador</th>
            <th className="px-3 py-2 font-semibold text-foreground">Recepção</th>
            <th className="px-3 py-2 font-semibold text-foreground">Profissional</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {PAPEIS.map(([oque, ...colunas]) => (
            <tr key={oque}>
              <td className="px-3 py-2 text-muted-foreground">{oque}</td>
              {colunas.map((c, i) => (
                <td key={i} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const [basico, pro] = PLANOS_PUBLICOS;

export const SECOES: Secao[] = [
  // -------------------------------------------------------------------------
  {
    id: "comece-aqui",
    grupo: "inicio",
    titulo: "Primeiro acesso e configuração inicial",
    resumo: "Crie a conta, cadastre o espaço e siga a lista de primeiros passos do painel.",
    perfis: ["admin"],
    onde: "salus → Criar meu espaço",
    link: "/cadastro",
    passos: [
      <>Em {b("Criar meu espaço")}, informe nome, e-mail e senha e aceite os termos. Confirme pelo link que chega no e-mail.</>,
      <>Entre e cadastre o espaço com o nome e o CNPJ (ou CPF). Você vira o {b("administrador")} e o espaço começa no plano {basico.nome}.</>,
      <>No {b("Início")}, siga a lista {b("Primeiros passos")}: unidade, salas, profissional, contrato, convite, paciente e primeira consulta. Cada etapa tem o botão {b("Começar →")}.</>,
      <>Se a sua conta é de administrador, o sistema pede a {b("verificação em duas etapas")} (app autenticador) para proteger os dados do espaço.</>,
    ],
    midias: [
      { tipo: "print", nome: "04-cadastro", legenda: "Cadastro do responsável pelo espaço" },
      { tipo: "print", nome: "10-admin-inicio", legenda: "Início do administrador com os primeiros passos" },
    ],
    dicas: [<>Participa de mais de um espaço? Troque entre eles pelo seletor no topo, ao lado do logo.</>],
    problemas: [
      { sintoma: "Não consigo entrar depois do cadastro", solucao: <>Confirme o e-mail pelo link recebido. Na tela de entrar, o sistema reenvia o link.</> },
      { sintoma: "Esqueci a senha", solucao: <>Na tela de entrar, clique em {b("Esqueceu a senha?")}: chega um e-mail com o link para criar uma nova (vale por pouco tempo).</> },
    ],
    termos: ["cadastro", "senha", "onboarding", "primeiros passos", "2fa"],
  },
  {
    id: "papeis",
    grupo: "inicio",
    titulo: "Quem faz o quê: papéis e permissões",
    resumo: "Cada pessoa vê só o que o papel dela permite. O sistema bloqueia o resto também no servidor.",
    perfis: ["admin", "recepcao", "profissional"],
    conteudo: (
      <div className="flex flex-col gap-3">
        <p>
          Há três papéis por espaço: {b("Administrador")}, {b("Recepção")} e {b("Profissional")}. Uma mesma pessoa pode ter papéis
          diferentes em espaços diferentes. O que não é do seu papel nem aparece no menu; se alguém abrir o endereço direto, vê{" "}
          {b("Página não encontrada ou Acesso Restrito")}.
        </p>
        <TabelaPapeis />
        <p>
          O conteúdo do prontuário é do profissional que escreveu: nem o administrador nem a recepção conseguem ler. Se um profissional
          deixa o espaço, o administrador pode fazer uma {b("solicitação formal")}, com justificativa, que fica registrada e expira.
        </p>
      </div>
    ),
    termos: ["permissão", "rbac", "acesso restrito", "papel"],
  },

  // -------------------------------------------------------------------------
  {
    id: "unidades-salas",
    grupo: "configurar",
    titulo: "Unidades, salas, horários e módulos",
    resumo: "O endereço físico, as salas que você aluga, quando abre e quais módulos opcionais o espaço usa.",
    perfis: ["admin"],
    onde: "Configurações → Unidades e salas",
    link: "/painel/unidades",
    passos: [
      <>Em {b("Nova unidade")}, informe nome, endereço e o tamanho do horário na grade (15, 30 ou 60 minutos). Clique em {b("Criar unidade")}.</>,
      <>Abra a unidade e cadastre as {b("salas")}. Ajuste os {b("horários de funcionamento")} por dia da semana.</>,
      <>Cadastre {b("feriados")}. Se o dia já tiver reservas, o sistema mostra a lista e pergunta se mantém ou cancela (com aviso por WhatsApp).</>,
      <>Em {b("Módulos do espaço")}, ligue só o que usa: {b("Notas fiscais (NFS-e)")}, {b("Agendamento online")} e {b("Prontuário eletrônico")}. Clique em {b("Salvar módulos")}.</>,
    ],
    midias: [
      { tipo: "print", nome: "11-unidades", legenda: "Unidades, módulos do espaço e política de cancelamento" },
      { tipo: "print", nome: "12-unidade", legenda: "Salas, horários e feriados da unidade" },
    ],
    dicas: [
      <>Desativar uma sala ou unidade não apaga o histórico. Reativar conta no limite do plano.</>,
      <>Desligado, o módulo some do menu de todos. O prontuário não pode ser desligado se já tiver registros (guarda de 20 anos).</>,
    ],
    problemas: [
      { sintoma: `"O plano ${basico.nome} permite apenas 1 unidade"`, solucao: <>Para a segunda unidade, mude para o {pro.nome} em {b("Assinatura")}.</> },
    ],
    termos: ["sala", "unidade", "feriado", "horário", "módulo", "nfs-e", "agenda online", "prontuário"],
  },
  {
    id: "profissionais",
    grupo: "configurar",
    titulo: "Profissionais e convites",
    resumo: "Cadastre quem aluga as salas e envie o convite para cada um ter o próprio acesso.",
    perfis: ["admin", "recepcao"],
    onde: "Configurações → Profissionais",
    link: "/painel/profissionais",
    passos: [
      <>Em {b("Novo profissional")}, preencha nome, e-mail, telefone, conselho e registro. O {b("CPF ou CNPJ")} é usado na nota fiscal e na cobrança.</>,
      <>Clique no profissional e em {b("Gerar convite")}. O link vale 7 dias; envie por WhatsApp ou e-mail.</>,
      <>O profissional abre o link, cria a senha com o mesmo e-mail e passa a ver a própria agenda, contrato e extrato.</>,
    ],
    midias: [
      { tipo: "print", nome: "13-profissionais", legenda: "Lista com a situação do acesso e do prontuário de cada um" },
      { tipo: "print", nome: "02-convite", legenda: "O que o profissional vê ao abrir o convite" },
    ],
    dicas: [<>Desativar um profissional pergunta o que fazer com as reservas futuras. Profissionais acima do limite do plano entram como excedente na fatura.</>],
    termos: ["convite", "crm", "crp", "médico", "psicólogo"],
  },
  {
    id: "equipe",
    grupo: "configurar",
    titulo: "Equipe: administradores e recepção",
    resumo: "Convide quem trabalha no espaço e defina o papel de cada pessoa.",
    perfis: ["admin"],
    onde: "Configurações → Equipe",
    link: "/painel/equipe",
    passos: [
      <>Clique em {b("Convidar Membro")}, informe o e-mail e escolha o papel ({b("Admin")} ou {b("Recepção")}).</>,
      <>A pessoa recebe o convite por e-mail, cria a conta e entra direto no espaço.</>,
      <>Use {b("Alterar Papel")} para promover ou rebaixar e o ícone ao lado para remover o acesso.</>,
    ],
    midias: [{ tipo: "print", nome: "16-equipe", legenda: "Membros ativos com o papel de cada um" }],
    dicas: [<>O espaço sempre precisa de pelo menos um administrador ativo.</>],
    termos: ["membro", "recepcionista", "administrador", "papel"],
  },
  {
    id: "notificacoes",
    grupo: "configurar",
    titulo: "Lembretes e WhatsApp",
    resumo: "Lembrete na véspera para pacientes que aceitaram e para profissionais com reserva.",
    perfis: ["admin"],
    onde: "Configurações → Notificações",
    link: "/painel/notificacoes",
    passos: [
      <>Conecte o WhatsApp do espaço lendo o {b("QR code")} com o celular (WhatsApp → Aparelhos conectados).</>,
      <>Na véspera, o paciente recebe a mensagem com um link para {b("confirmar")} ou {b("cancelar")}; o profissional recebe o lembrete da reserva.</>,
      <>Acompanhe o envio pelas abas {b("Pendentes")}, {b("Enviadas")}, {b("Falharam")} e {b("Canceladas")}.</>,
    ],
    midias: [{ tipo: "print", nome: "50-notificacoes", legenda: "Histórico de lembretes enviados" }],
    problemas: [
      { sintoma: "Lembretes na aba Falharam", solucao: <>Confira se o WhatsApp continua conectado e se o telefone do paciente tem DDD. O sistema tenta de novo sem duplicar.</> },
    ],
    termos: ["whatsapp", "lembrete", "qr code", "confirmação"],
  },

  // -------------------------------------------------------------------------
  {
    id: "agenda",
    grupo: "dia-a-dia",
    titulo: "Agenda: agendar paciente em um passo",
    resumo: "Clique num horário livre da grade: o sistema reserva a sala e agenda o paciente juntos.",
    perfis: ["admin", "recepcao", "profissional"],
    onde: "Agenda",
    link: "/painel/agenda",
    passos: [
      <>Escolha o dia e a visão ({b("Dia")}, {b("Semana")} ou {b("Lista")}). Cada coluna é uma sala.</>,
      <>Clique num horário livre. No modal {b("Novo Agendamento")}, fique em {b("Agendar Consulta (Paciente)")}.</>,
      <>Busque o paciente pelo nome, telefone ou CPF. Não achou? Use {b("+ Novo paciente")}: nome e WhatsApp bastam.</>,
      <>Escolha o profissional, ajuste início e término e clique em {b("Confirmar Agendamento")}. Se a sala estava livre, ela é reservada automaticamente.</>,
      <>Para agendar dentro de um turno que o profissional já reservou, clique no bloco tracejado {b("+ Agendar")}: o modal já vem com o profissional travado.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "agendar-paciente", legenda: "Agendando um paciente num horário livre" },
      { tipo: "print", nome: "21-agenda-salas", legenda: "Grade do dia com as salas lado a lado" },
      { tipo: "print", nome: "22-agendar-modal", legenda: "Modal de agendamento com o paciente escolhido" },
    ],
    dicas: [<>A linha vermelha marca a hora atual. O painel de salas mostra quais estão livres agora.</>],
    problemas: [
      { sintoma: `"A sala já está reservada nesse horário"`, solucao: <>Outro agendamento ocupa parte do intervalo: escolha outra sala ou outro horário.</> },
      { sintoma: `"O profissional já tem outra reserva nesse horário"`, solucao: <>O profissional não pode estar em duas salas ao mesmo tempo.</> },
    ],
    termos: ["agendar", "consulta", "grade", "horário", "sala", "novo paciente"],
  },
  {
    id: "check-in",
    grupo: "dia-a-dia",
    titulo: "Chegada, falta, valor e cancelamento",
    resumo: "Clique na consulta para registrar a chegada do paciente, a falta, o valor ou cancelar.",
    perfis: ["admin", "recepcao", "profissional"],
    onde: "Agenda → clique na consulta",
    link: "/painel/agenda",
    passos: [
      <>Clique na consulta na grade. Abre {b("Detalhes da Consulta")}.</>,
      <>Quando o paciente chegar, clique em {b("✓ Paciente Chegou (Check-in)")}. A chegada pode ser registrada a partir de 1 hora antes.</>,
      <>Depois do atendimento, {b("Concluir (Realizado)")}. Se não veio, {b("Registrar Falta")}.</>,
      <>Errou? {b("Desfazer Última Mudança")} volta ao status anterior.</>,
      <>Em {b("Valor Pago da Consulta")}, registre quanto o paciente pagou (vai para o recibo).</>,
    ],
    midias: [
      { tipo: "animacao", nome: "check-in", legenda: "Registrando a chegada do paciente" },
      { tipo: "print", nome: "23-detalhes-consulta", legenda: "Detalhes da consulta com as ações" },
    ],
    dicas: [<>Cancelamento em cima da hora (dentro do prazo da política do espaço) pode contar como falta. Configure em {b("Unidades e salas")}.</>],
    termos: ["check-in", "chegou", "falta", "realizado", "cancelar", "status", "valor"],
  },
  {
    id: "remarcar",
    grupo: "dia-a-dia",
    titulo: "Remarcar consulta",
    resumo: "Arraste a consulta na grade ou mude data, horário e sala nos detalhes. Remarcar nunca gera cobrança.",
    perfis: ["admin", "recepcao", "profissional"],
    onde: "Agenda",
    link: "/painel/agenda",
    passos: [
      <>Arraste o bloco da consulta para o novo horário (mesma duração). Se precisar, a sala de destino é reservada.</>,
      <>Ou clique na consulta, em {b("Alterar horário")}, escolha nova data, início, término e sala e clique em {b("Confirmar Remarcação")}.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "remarcar-arrastando", legenda: "Remarcando ao arrastar na grade" },
      { tipo: "print", nome: "25-remarcar", legenda: "Remarcação pelo formulário" },
    ],
    dicas: [<>O lembrete do horário antigo é descartado e um novo é agendado.</>],
    termos: ["remarcar", "arrastar", "mudar horário"],
  },
  {
    id: "consultas-do-dia",
    grupo: "dia-a-dia",
    titulo: "Consultas do dia em lista",
    resumo: "A mesma agenda em lista, boa para a recepção ir marcando chegadas na ordem.",
    perfis: ["admin", "recepcao", "profissional"],
    onde: "Agenda → Lista",
    link: "/painel/agenda?visao=lista",
    midias: [{ tipo: "print", nome: "24-consultas-do-dia", legenda: "Lista de consultas com ações rápidas" }],
    termos: ["lista", "consultas do dia"],
  },
  {
    id: "pacientes",
    grupo: "dia-a-dia",
    titulo: "Pacientes",
    resumo: "Cadastro completo, responsável legal para menores, convênio e direitos do titular (LGPD).",
    perfis: ["admin", "recepcao", "profissional"],
    onde: "Pacientes",
    link: "/painel/pacientes",
    passos: [
      <>Em {b("Cadastrar paciente")}, nome e WhatsApp bastam. CPF, nascimento, convênio e endereço ficam em {b("Responsável, convênio e endereço")}.</>,
      <>Menor de idade exige o {b("responsável legal")} (nome e parentesco).</>,
      <>Marque o aceite de lembretes só com o consentimento do paciente: sem ele, nada é enviado.</>,
      <>Na ficha, o administrador pode {b("exportar")} os dados (pedido do titular) ou {b("anonimizar")} o cadastro.</>,
    ],
    midias: [
      { tipo: "print", nome: "26-pacientes", legenda: "Lista de pacientes com busca" },
      { tipo: "print", nome: "27-paciente", legenda: "Ficha do paciente com histórico" },
    ],
    dicas: [<>O profissional vê só os pacientes que atende ou que foram compartilhados com ele.</>],
    termos: ["paciente", "cadastro", "menor", "responsável", "lgpd", "anonimizar", "exportar"],
  },
  {
    id: "lista-espera",
    grupo: "dia-a-dia",
    titulo: "Lista de espera",
    resumo: "Guarde quem quer um horário e encaixe quando alguém desmarcar.",
    perfis: ["admin", "recepcao"],
    onde: "Lista de espera",
    link: "/painel/espera",
    passos: [
      <>Adicione o paciente com o profissional desejado (opcional) e a preferência de horário.</>,
      <>Quando um horário vagar, ligue ou mande mensagem e agende normalmente pela agenda; depois remova da lista.</>,
    ],
    midias: [{ tipo: "print", nome: "28-lista-espera", legenda: "Pacientes aguardando horário" }],
    termos: ["espera", "encaixe", "vaga"],
  },

  // -------------------------------------------------------------------------
  {
    id: "inicio-profissional",
    grupo: "profissional",
    titulo: "O dia do profissional (também no celular)",
    resumo: "No início e na agenda, você vê as próprias reservas e pacientes. No celular, a lista Meu dia vem primeiro.",
    perfis: ["profissional"],
    onde: "Início e Agenda",
    link: "/painel/agenda",
    midias: [
      { tipo: "print", nome: "30-profissional-inicio", legenda: "Início do profissional" },
      { tipo: "print", nome: "35-meu-dia-celular", legenda: "Meu dia no celular" },
    ],
    termos: ["meu dia", "celular", "agenda do profissional"],
  },
  {
    id: "reservar-sala",
    grupo: "profissional",
    titulo: "Reservar sala vendo o valor",
    resumo: "Reserve um turno e veja quanto vai custar pelo seu contrato antes de confirmar.",
    perfis: ["profissional", "admin", "recepcao"],
    onde: "Agenda → horário livre → Apenas Reservar Sala",
    link: "/painel/agenda",
    passos: [
      <>Clique num horário livre e escolha {b("Apenas Reservar Sala")}.</>,
      <>Ajuste início e término. Para turno fixo, use {b("Repetição")} (semanal, quinzenal ou mensal) e a data final.</>,
      <>Confira o {b("Valor estimado")} (pelo contrato) e clique em {b("Reservar Horário da Sala")}.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "reservar-sala", legenda: "Reservando um turno com o valor estimado" },
      { tipo: "print", nome: "31-reservar-sala", legenda: "Valor estimado pelo contrato antes de reservar" },
    ],
    problemas: [
      { sintoma: "Cancelei e fui cobrado", solucao: <>Cancelamento dentro do prazo da política do contrato pode ter multa. Veja as condições em {b("Meu contrato")}.</> },
    ],
    termos: ["reservar", "sala", "turno", "recorrência", "valor estimado"],
  },
  {
    id: "meu-extrato",
    grupo: "profissional",
    titulo: "Meu contrato, meu extrato e recibo",
    resumo: "Condições do aluguel, quanto você deve no mês, pagamento por PIX e recibo para o paciente.",
    perfis: ["profissional"],
    onde: "Meu contrato · Meu extrato",
    link: "/painel/extrato",
    passos: [
      <>Em {b("Meu contrato")}, veja o valor (por hora, por consulta, percentual ou mensalidade), a grade fixa e a política de cancelamento.</>,
      <>Em {b("Meu extrato")}, escolha o mês: aparecem as reservas, ajustes e pagamentos. Com saldo, pague por {b("PIX")} ali mesmo.</>,
      <>Em cada consulta paga, gere o {b("Recibo")} e use {b("Imprimir / Salvar PDF")}.</>,
    ],
    midias: [
      { tipo: "print", nome: "32-meu-contrato", legenda: "Contrato do profissional" },
      { tipo: "print", nome: "33-meu-extrato", legenda: "Extrato do mês" },
      { tipo: "print", nome: "34-recibo", legenda: "Recibo do atendimento" },
    ],
    termos: ["extrato", "pix", "contrato", "recibo", "saldo"],
  },
  {
    id: "prontuario",
    grupo: "profissional",
    titulo: "Prontuário eletrônico",
    resumo: "Evoluções cifradas que só você lê, imutáveis depois de finalizadas, com adendos, anexos e impressão.",
    perfis: ["profissional"],
    onde: "Prontuário",
    link: "/painel/prontuario",
    passos: [
      <>Na primeira vez, clique em {b("Começar 15 dias grátis")} (ou peça ao administrador para ativar pelo espaço).</>,
      <>Escolha o paciente, escreva a evolução (ou use um modelo) e clique em {b("Criar rascunho")}. Rascunho pode ser editado ou descartado.</>,
      <>Clique em {b("Finalizar")}: o registro fica imutável, com data, autoria e código de integridade.</>,
      <>Precisa corrigir? Use {b("Criar adendo")} no registro finalizado.</>,
      <>Anexe exames ao rascunho, compartilhe com outro profissional com o consentimento do paciente e imprima em {b("Imprimir / PDF")}.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "evolucao-prontuario", legenda: "Escrevendo e finalizando uma evolução" },
      { tipo: "print", nome: "36-prontuario-lista", legenda: "Pacientes do prontuário e situação da licença" },
      { tipo: "print", nome: "37-prontuario-paciente", legenda: "Evoluções do paciente, rascunho e editor" },
    ],
    conteudo: (
      <div className="flex flex-col gap-2">
        <p>{b("Licença e pagamento")}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{b("Teste")}: 15 dias grátis, só na primeira ativação.</li>
          <li>{b("Ativada pelo administrador")}: depois do teste, entra na fatura mensal do espaço. Você não paga nada.</li>
          <li>
            {b("Ativada por você")}: depois do teste, você paga direto ({formatarMoeda(basico.precoProntuarioCentavos)} a cada 30 dias no{" "}
            {basico.nome} e no {pro.nome}) por PIX ou cartão, e toca em {b("Já paguei, ativar")}.
          </li>
          <li>Sem pagamento, os registros continuam {b("disponíveis para leitura")}; só novas evoluções, adendos e anexos ficam bloqueados.</li>
        </ul>
      </div>
    ),
    problemas: [
      { sintoma: `"Falta o CPF do profissional no cadastro"`, solucao: <>A cobrança precisa do CPF: peça ao administrador para preencher em {b("Profissionais")}.</> },
      { sintoma: "Paguei e continua bloqueado", solucao: <>O PIX pode levar alguns instantes. Toque em {b("Já paguei, ativar")} de novo; a confirmação também chega sozinha.</> },
    ],
    termos: ["prontuário", "evolução", "adendo", "anexo", "licença", "teste grátis", "cfm", "cifrado"],
  },
  {
    id: "agenda-online",
    grupo: "profissional",
    titulo: "Agendamento online pelo paciente",
    resumo: "Uma página pública onde o paciente escolhe o horário dentro das suas reservas de sala.",
    perfis: ["profissional", "admin"],
    onde: "Agenda online",
    link: "/painel/agendamento-online",
    passos: [
      <>O administrador liga o módulo {b("Agendamento online")} em {b("Unidades e salas")}.</>,
      <>Em {b("Agenda online")}, marque {b("Aceitar agendamentos pela página pública")}, a duração da consulta, a antecedência mínima e até quantos dias à frente.</>,
      <>Copie o link da sua página e divulgue (Instagram, WhatsApp, cartão).</>,
      <>Só aparecem horários dentro das suas {b("reservas de sala")}, sem conflito com consultas marcadas.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "agendar-online", legenda: "O paciente agendando pelo celular", celular: true },
      { tipo: "print", nome: "38-agenda-online", legenda: "Configuração da página pública" },
    ],
    problemas: [{ sintoma: "A página não mostra horários", solucao: <>Reserve sala na agenda para os próximos dias: a página só oferece horários dentro das suas reservas.</> }],
    termos: ["agendamento online", "link", "página pública", "instagram"],
  },

  // -------------------------------------------------------------------------
  {
    id: "contratos",
    grupo: "dinheiro",
    titulo: "Contratos dos profissionais",
    resumo: "Quanto cada profissional paga pela sala, grade fixa, política de cancelamento e minuta para assinar.",
    perfis: ["admin"],
    onde: "Contratos",
    link: "/painel/contratos",
    passos: [
      <>Em {b("Novo contrato")}, escolha o profissional e o modelo: por hora reservada, por consulta, percentual ou mensalidade (com horas incluídas).</>,
      <>Defina a regra de falta, o prazo de cancelamento sem custo e, se houver, a {b("grade fixa")} (dias e horários da sala).</>,
      <>Imprima a {b("minuta")} para assinatura.</>,
      <>Reajuste com {b("Reajustar (nova versão)")}: a versão anterior se encerra na véspera e a grade continua.</>,
    ],
    midias: [
      { tipo: "print", nome: "14-contratos", legenda: "Contratos vigentes, futuros e encerrados" },
      { tipo: "print", nome: "15-contrato-novo", legenda: "Novo contrato com grade fixa" },
    ],
    dicas: [<>O último dia do contrato ainda vale. Uma nova versão com término só substitui a anterior se cobrir até o fim dela.</>],
    termos: ["contrato", "reajuste", "grade fixa", "minuta", "aluguel"],
  },
  {
    id: "financeiro",
    grupo: "dinheiro",
    titulo: "Financeiro e fechamento do mês",
    resumo: "O que cada profissional deve, pagamentos, ajustes, fechamento com PDF e exportação para a contabilidade.",
    perfis: ["admin", "recepcao"],
    onde: "Financeiro",
    link: "/painel/financeiro",
    passos: [
      <>Em {b("Financeiro")}, escolha o mês: cada profissional aparece com o valor do mês e a situação.</>,
      <>Abra o profissional para ver os lançamentos. Registre pagamentos recebidos e ajustes.</>,
      <>Clique em {b("Fechar <mês>")}: o extrato congela (correções caem no mês seguinte) e a cobrança por PIX pode ser enviada.</>,
      <>Em {b("Fechamento")}, use {b("Imprimir / Salvar PDF")} ou baixe o {b("CSV")} para a contabilidade.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "fechar-mes", legenda: "Fechando o mês de um profissional" },
      { tipo: "print", nome: "40-financeiro", legenda: "Resumo do mês por profissional" },
      { tipo: "print", nome: "41-financeiro-profissional", legenda: "Lançamentos de um profissional" },
      { tipo: "print", nome: "42-fechamento-pdf", legenda: "Relatório de fechamento para imprimir" },
    ],
    dicas: [<>Só o administrador fecha e reprocessa o mês; a recepção consulta e registra pagamentos.</>],
    termos: ["financeiro", "fechamento", "csv", "contabilidade", "pagamento", "ajuste", "pix"],
  },
  {
    id: "notas-fiscais",
    grupo: "dinheiro",
    titulo: "Notas fiscais (NFS-e)",
    resumo: "Nota de locação para os profissionais, emitida a partir do mês fechado.",
    perfis: ["admin", "recepcao"],
    onde: "Notas fiscais",
    link: "/painel/fiscal",
    passos: [
      <>Ligue o módulo em {b("Unidades e salas")}. Em {b("Notas fiscais")}, preencha a configuração (município, regime, alíquota, token do emissor).</>,
      <>Com o mês fechado, emita por profissional ou todas de uma vez. Acompanhe até {b("autorizada")}.</>,
      <>Para cancelar, informe a justificativa.</>,
    ],
    midias: [{ tipo: "print", nome: "43-notas-fiscais", legenda: "Notas do mês" }],
    termos: ["nota fiscal", "nfs-e", "iss", "emitir"],
  },

  // -------------------------------------------------------------------------
  {
    id: "planos",
    grupo: "controle",
    titulo: "Planos, limites e excedentes",
    resumo: "Todos os planos têm os mesmos recursos; muda o tamanho. Passou do limite de salas ou profissionais? Nada trava.",
    perfis: ["admin"],
    onde: "Configurações → Assinatura",
    link: "/painel/assinatura",
    conteudo: (
      <div className="flex flex-col gap-3">
        <TabelaPlanos />
        <p>{b("Como a fatura é calculada")}: mensalidade + salas e profissionais além do incluído + unidades extras + licenças de prontuário pagas pelo espaço.</p>
        <p className="rounded-lg bg-muted/40 p-3">
          Exemplo no {basico.nome}: 7 salas e 16 profissionais = {formatarMoeda(basico.precoMensalCentavos)} + 2 ×{" "}
          {formatarMoeda(basico.precoSalaExtraCentavos)} + 1 × {formatarMoeda(basico.precoProfissionalExtraCentavos)} ={" "}
          <strong>
            {formatarMoeda(basico.precoMensalCentavos + 2 * basico.precoSalaExtraCentavos + basico.precoProfissionalExtraCentavos)}
          </strong>
          /mês.
        </p>
        <p>
          A fatura é gerada no início do mês e vence no dia 10 (a primeira, 3 dias depois de gerada), pelo Asaas: PIX, boleto ou cartão. Em{" "}
          {b("Projeção da Próxima Fatura")} você vê a estimativa com o uso atual.
        </p>
      </div>
    ),
    passos: [
      <>Em {b("Assinatura")}, veja o plano atual, o uso e a estimativa da próxima fatura.</>,
      <>Para mudar, clique em {b("Fazer upgrade")} ou {b("Mudar para este")} e confirme. Os limites mudam na hora; a próxima fatura já usa o novo plano.</>,
      <>Para voltar ao {basico.nome}, as unidades ativas precisam caber no limite (salas e profissionais a mais viram excedente).</>,
    ],
    midias: [
      { tipo: "animacao", nome: "trocar-plano", legenda: "Mudando de plano" },
      { tipo: "print", nome: "60-assinatura", legenda: "Assinatura: plano, uso, próxima fatura e faturas" },
      { tipo: "print", nome: "62-planos", legenda: "Planos disponíveis" },
    ],
    termos: ["plano", "básico", "pro", "enterprise", "excedente", "fatura", "upgrade", "downgrade", "preço"],
  },
  {
    id: "licencas",
    grupo: "controle",
    titulo: "Licenças do prontuário pelo espaço",
    resumo: "Ative o prontuário para um profissional pagando pelo espaço, ou assuma a licença de quem deixou vencer.",
    perfis: ["admin"],
    onde: "Assinatura → Módulo de Prontuário Eletrônico",
    link: "/painel/assinatura",
    passos: [
      <>Em {b("Assinatura")}, na lista de profissionais, clique em {b("Ativar prontuário")}. O primeiro uso tem 15 dias grátis.</>,
      <>Depois do teste, a licença entra na fatura mensal do espaço no preço do plano.</>,
      <>Licença do profissional com pagamento vencido aparece como {b("Pagamento do profissional vencido")}: use {b("Assumir pelo espaço")} para liberar.</>,
      <>{b("Desativar licença")} para de cobrar; os registros continuam guardados para leitura.</>,
    ],
    midias: [{ tipo: "print", nome: "61-licencas-prontuario", legenda: "Licenças por profissional e quem paga cada uma" }],
    termos: ["licença", "prontuário", "ativar", "desativar"],
  },
  {
    id: "atraso",
    grupo: "controle",
    titulo: "Fatura em atraso e espaço só para consulta",
    resumo: "O que acontece se a fatura do Salus atrasar e como regularizar.",
    perfis: ["admin", "recepcao", "profissional"],
    conteudo: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Venceu: o administrador vê o aviso no painel. Há {b("15 dias de carência")}.</li>
        <li>5 dias antes do fim da carência, o administrador recebe um e-mail.</li>
        <li>
          Passou a carência: o espaço fica {b("só para consulta")} para todos. Dá para ver tudo, mas não marcar nem alterar. A página de agendamento
          online sai do ar.
        </li>
        <li>Pagou: tudo volta sozinho, sem perder nada. Pagar, trocar de plano e mexer no próprio perfil funcionam mesmo durante a suspensão.</li>
      </ol>
    ),
    midias: [{ tipo: "print", nome: "65-espaco-suspenso", legenda: "Aviso de espaço só para consulta" }],
    problemas: [
      { sintoma: `"Este espaço está só para consulta…"`, solucao: <>Peça ao administrador para pagar a fatura em {b("Assinatura")} (botão {b("Pagar a fatura")} no aviso).</> },
      { sintoma: `"Acesso ao espaço suspenso"`, solucao: <>O espaço foi suspenso pela equipe Salus: o administrador deve falar com o suporte.</> },
    ],
    termos: ["atraso", "suspenso", "carência", "só consulta", "inadimplência", "bloqueado"],
  },
  {
    id: "seguranca",
    grupo: "controle",
    titulo: "Perfil, segurança e privacidade",
    resumo: "Senha, verificação em duas etapas, auditoria e dados dos pacientes (LGPD).",
    perfis: ["admin", "recepcao", "profissional"],
    onde: "Configurações → Meu perfil",
    link: "/painel/perfil",
    passos: [
      <>Em {b("Meu perfil")}, troque nome, telefone e senha.</>,
      <>Ative a {b("verificação em duas etapas")}: escaneie o QR code com o app autenticador e guarde os {b("códigos de recuperação")}.</>,
      <>Ações importantes (fechamentos, mudanças de plano, acessos ao prontuário) ficam registradas na auditoria do espaço.</>,
    ],
    midias: [{ tipo: "print", nome: "03-perfil", legenda: "Meu perfil" }],
    dicas: [
      <>Os dados de cada espaço ficam separados no próprio banco de dados; o prontuário é cifrado e cada acesso fica registrado.</>,
      <>Quando os Termos de Uso ou a Política de Privacidade mudam, o sistema pede o novo aceite.</>,
    ],
    termos: ["senha", "2fa", "duas etapas", "autenticador", "lgpd", "privacidade", "auditoria"],
  },

  // -------------------------------------------------------------------------
  {
    id: "paciente-link",
    grupo: "paciente",
    titulo: "Link do paciente: confirmar, cancelar e salvar na agenda",
    resumo: "O paciente recebe um link no WhatsApp para confirmar ou cancelar e salvar a consulta no celular.",
    perfis: ["paciente", "recepcao"],
    passos: [
      <>O paciente toca no link do lembrete (ou do agendamento online).</>,
      <>Vê o profissional, data, horário e endereço com {b("Ver no mapa")}.</>,
      <>Toca em {b("Confirmar presença")} ou {b("Não vou poder ir")} (cancela); {b("Adicionar à agenda do celular")} baixa o evento.</>,
    ],
    midias: [
      { tipo: "print", nome: "70-link-paciente", legenda: "O que o paciente vê ao abrir o link" },
      { tipo: "print", nome: "71-agendar-online", legenda: "Página pública de agendamento" },
    ],
    dicas: [<>Cancelamento dentro do prazo da política do espaço pode contar como falta.</>],
    termos: ["paciente", "link", "confirmar presença", "cancelar", "ics", "calendário"],
  },

  // -------------------------------------------------------------------------
  {
    id: "plataforma",
    grupo: "plataforma",
    titulo: "Área da plataforma (equipe Salus)",
    resumo: "Visão de todos os espaços, planos, faturamento do SaaS, usuários e auditoria.",
    perfis: ["plataforma"],
    onde: "/plataforma",
    link: "/plataforma",
    passos: [
      <>{b("Visão Geral")}: espaços ativos e suspensos, usuários e receita estimada.</>,
      <>{b("Clínicas")}: abra um espaço para ver recursos, equipe, licenças e faturas; suspenda, reative ou troque o plano.</>,
      <>{b("Planos")}: altere preço, limites e preços de excedente e do prontuário. Vale para as próximas faturas.</>,
      <>{b("Financeiro")}: faturas de todos os espaços, com o que está pago, em aberto e em atraso.</>,
      <>{b("Usuários")} e {b("Auditoria")}: bloquear acesso e ver quem fez cada alteração.</>,
    ],
    midias: [
      { tipo: "print", nome: "80-plataforma", legenda: "Visão geral da plataforma" },
      { tipo: "print", nome: "81-plataforma-clinicas", legenda: "Espaços cadastrados" },
      { tipo: "print", nome: "82-plataforma-planos", legenda: "Edição dos planos" },
      { tipo: "print", nome: "83-plataforma-financeiro", legenda: "Faturamento do SaaS" },
    ],
    dicas: [<>A área exige a verificação em duas etapas. Toda ação fica na auditoria da plataforma.</>],
    termos: ["superadmin", "plataforma", "clínicas", "planos", "faturamento"],
  },

  // -------------------------------------------------------------------------
  {
    id: "glossario",
    grupo: "ajuda",
    titulo: "Glossário",
    resumo: "Os termos que aparecem no sistema.",
    perfis: ["admin", "recepcao", "profissional", "paciente"],
    conteudo: (
      <dl className="grid gap-2 sm:grid-cols-2">
        {[
          ["Reserva", "O profissional ocupa uma sala num horário. É o que o espaço cobra."],
          ["Agendamento / consulta", "Um paciente marcado dentro de uma reserva."],
          ["Grade fixa", "Reservas que se repetem toda semana pelo contrato."],
          ["Competência", "O mês a que um valor se refere."],
          ["Fechamento", "Congela o extrato do mês do profissional."],
          ["Excedente", "Sala, profissional ou unidade além do incluído no plano, cobrada à parte."],
          ["Carência", "Os 15 dias depois do vencimento da fatura antes de o espaço ficar só para consulta."],
          ["Adendo", "Correção de um registro clínico já finalizado."],
        ].map(([termo, definicao]) => (
          <div key={termo} className="rounded-lg border p-3">
            <dt className="font-semibold text-foreground">{termo}</dt>
            <dd className="text-muted-foreground">{definicao}</dd>
          </div>
        ))}
      </dl>
    ),
    termos: ["glossário", "termos"],
  },
  {
    id: "faq",
    grupo: "ajuda",
    titulo: "Perguntas frequentes",
    resumo: "Respostas rápidas para o que mais perguntam.",
    perfis: ["admin", "recepcao", "profissional"],
    problemas: [
      { sintoma: "Uma tela do menu sumiu", solucao: <>Ou o seu papel não tem acesso, ou o módulo foi desligado em {b("Unidades e salas")}.</> },
      { sintoma: "Apareceu “Ocorreu um erro interno (ERR-…)”", solucao: <>Tente de novo. Se continuar, mande o código ao suporte: ele identifica o erro sem expor dados.</> },
      { sintoma: "Posso usar no celular?", solucao: <>Sim. O menu vira o botão ☰ e o profissional vê a lista do dia primeiro.</> },
      { sintoma: "Como imprimo ou salvo em PDF?", solucao: <>Recibos, contratos, fechamento e prontuário têm {b("Imprimir / Salvar PDF")}. Este manual também pode ser impresso pelo navegador.</> },
      { sintoma: "Tem fidelidade?", solucao: <>Não. Pode mudar de plano quando quiser.</> },
    ],
    termos: ["dúvida", "pergunta", "erro", "celular", "pdf"],
  },
];
