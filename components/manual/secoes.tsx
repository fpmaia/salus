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
    resumo: "Evoluções e documentos cifrados que só você lê, imutáveis depois de finalizados, com adendos, anexos e impressão.",
    perfis: ["profissional"],
    onde: "Prontuário",
    link: "/painel/prontuario",
    passos: [
      <>Na primeira vez, clique em {b("Começar 15 dias grátis")} (ou peça ao administrador para ativar pelo espaço).</>,
      <>Escolha o paciente. Na aba {b("Evoluções")}, escreva a anotação da sessão e clique em {b("Criar rascunho")}. Rascunho pode ser editado ou descartado.</>,
      <>Clique em {b("Finalizar")}: o registro fica imutável, com data, autoria e código de integridade.</>,
      <>Precisa corrigir? Use {b("Criar adendo")} no registro finalizado.</>,
      <>Anexe exames ao rascunho, compartilhe com outro profissional com o consentimento do paciente e imprima tudo em {b("Imprimir prontuário completo")}.</>,
      <>Relatórios, laudos, declarações e atestados ficam na aba {b("Documentos")}: veja a seção {b("Relatórios, laudos e declarações")}.</>,
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
    id: "documentos-clinicos",
    grupo: "profissional",
    titulo: "Relatórios, laudos e declarações",
    resumo: "Documentos para entregar ao paciente, à escola, ao convênio ou a outro profissional, separados das evoluções.",
    perfis: ["profissional"],
    onde: "Prontuário › paciente › aba Documentos",
    link: "/painel/prontuario",
    passos: [
      <>Abra o paciente em {b("Prontuário")} e clique na aba {b("Documentos")}.</>,
      <>Escolha um modelo ({b("Relatório clínico")}, {b("Laudo / parecer")}, {b("Atestado de comparecimento")}, {b("Declaração de acompanhamento")}, {b("Encaminhamento")} ou os de psicologia) ou comece em branco.</>,
      <>Confira o {b("Título do documento")}, complete o texto e clique em {b("Criar rascunho")}.</>,
      <>Revise e clique em {b("Finalizar")}. O documento fica imutável, com data, autoria e código de integridade.</>,
      <>Clique em {b("Imprimir documento / PDF")} para imprimir ou salvar em PDF, com cabeçalho do espaço, seus dados e linha de assinatura.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "documento-prontuario", legenda: "Emitindo uma declaração a partir do modelo" },
      { tipo: "print", nome: "37b-prontuario-documentos", legenda: "Aba Documentos com os modelos e um relatório finalizado" },
    ],
    dicas: [
      <>O modelo só preenche o texto: troque o que estiver entre parênteses pelos dados do paciente antes de finalizar.</>,
      <>Precisa corrigir um documento já entregue? Use {b("Incluir adendo")}: o original não muda e o adendo sai na impressão.</>,
    ],
    problemas: [
      { sintoma: "Não aparece a aba Documentos", solucao: <>A aba fica dentro do paciente, em {b("Prontuário")}. Se nem o Prontuário aparece, o administrador precisa ligar o módulo.</> },
      { sintoma: `"Dê um título ao documento"`, solucao: <>Todo documento precisa de título (ex.: Relatório clínico). Escolher um modelo já preenche.</> },
      { sintoma: "Não consigo criar documento", solucao: <>Com a licença do prontuário vencida, você só consulta. Regularize o pagamento para voltar a escrever.</> },
    ],
    termos: ["relatório", "laudo", "parecer", "declaração", "atestado", "encaminhamento", "documento", "pdf", "imprimir", "escola"],
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
      <>Tem um cupom? Digite em {b("Descontos e cupom")} e clique em {b("Aplicar cupom")}. O desconto entra a partir da próxima fatura; descontos e créditos combinados com a equipe Salus aparecem no mesmo quadro.</>,
    ],
    midias: [
      { tipo: "animacao", nome: "trocar-plano", legenda: "Mudando de plano" },
      { tipo: "print", nome: "60-assinatura", legenda: "Assinatura: plano, uso, próxima fatura e faturas" },
      { tipo: "print", nome: "62-planos", legenda: "Planos disponíveis" },
    ],
    termos: ["plano", "básico", "pro", "enterprise", "excedente", "fatura", "upgrade", "downgrade", "preço", "cupom", "desconto"],
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
        <li>Venceu: o administrador vê o aviso no painel. Há {b("15 dias de carência")} (ou o prazo combinado com a equipe Salus).</li>
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
      { sintoma: `"Acesso ao espaço suspenso"`, solucao: <>O espaço foi suspenso pela equipe Salus; o motivo aparece na tela. O administrador deve falar com o suporte.</> },
      { sintoma: "Não consigo pagar tudo de uma vez", solucao: <>Fale com a equipe Salus: dá para mudar o vencimento ou fazer um acordo em parcelas, que aparece em {b("Assinatura")} com o link de cada parcela.</> },
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
      <>{b("Visão Geral")}: espaços, usuários e o quadro {b("Precisa de atenção")} (fatura que não chegou ao Asaas, parcela de acordo vencida, teste grátis acabando).</>,
      <>{b("Clínicas")}: abra uma clínica. A ficha tem as abas {b("Resumo")}, {b("Cobrança")}, {b("Acordos")}, {b("Acessos")}, {b("Notas")} e {b("Histórico")}.</>,
      <>{b("Resumo")}: troque o plano vendo quanto sairia a próxima fatura em cada um; suspenda com um motivo (a clínica vê ao entrar), reative ou cancele a conta.</>,
      <>{b("Acessos")}: encerre as sessões de um usuário ou bloqueie o acesso dele. {b("Notas")}: registre combinados com a clínica (ela não vê). {b("Histórico")}: tudo o que a equipe Salus e a própria clínica fizeram.</>,
      <>{b("Planos")}: preço, limites e excedentes de cada plano, para todas as clínicas.</>,
      <>{b("Usuários")} e {b("Auditoria")}: bloquear acesso e ver quem fez cada alteração, com filtros e exportação em CSV.</>,
    ],
    midias: [
      { tipo: "print", nome: "80-plataforma", legenda: "Visão geral da plataforma" },
      { tipo: "print", nome: "81-plataforma-clinicas", legenda: "Espaços cadastrados" },
      { tipo: "print", nome: "89-clinica-resumo", legenda: "Ficha da clínica: trocar plano, suspender e cancelar" },
      { tipo: "print", nome: "93-clinica-notas", legenda: "Notas internas da equipe" },
      { tipo: "print", nome: "82-plataforma-planos", legenda: "Edição dos planos" },
    ],
    dicas: [
      <>A área exige a verificação em duas etapas. Toda ação fica na auditoria da plataforma.</>,
      <>Cancelar a conta é só do Dono e pede para digitar o nome da clínica. As faturas em aberto são canceladas também no Asaas; os dados ficam guardados e a conta pode ser reaberta.</>,
    ],
    termos: ["superadmin", "plataforma", "clínicas", "planos", "suspender", "cancelar conta", "sessões", "notas"],
  },
  {
    id: "equipe-plataforma",
    grupo: "plataforma",
    titulo: "Equipe da plataforma e papéis",
    resumo: "Quem administra o Salus e o que cada papel pode fazer.",
    perfis: ["plataforma"],
    onde: "/plataforma/equipe",
    link: "/plataforma/equipe",
    passos: [
      <>Em {b("Equipe")}, informe o e-mail da pessoa e o papel: {b("Dono")}, {b("Financeiro")} ou {b("Suporte")}. Clique em {b("Enviar convite")}.</>,
      <>A pessoa entra (ou cria a conta) com aquele e-mail, abre {b("/plataforma")} e clica em {b("Aceitar convite")}. Em seguida configura a verificação em duas etapas.</>,
      <>Para mudar o papel ou tirar alguém da equipe, use {b("Mudar papel")} ou {b("Remover")} na lista. A conta continua existindo, só sem acesso à plataforma.</>,
    ],
    midias: [{ tipo: "print", nome: "87-plataforma-equipe", legenda: "Equipe, convites pendentes e o que cada papel pode fazer" }],
    conteudo: (
      <ul className="list-disc space-y-1 pl-5">
        <li>{b("Dono")}: tudo, inclusive planos, equipe, cancelamento de contas e banimento de usuários.</li>
        <li>{b("Financeiro")}: plano da clínica, teste grátis, condições, descontos, créditos, cupons, faturas e acordos.</li>
        <li>{b("Suporte")}: vê tudo, suspende e reativa clínicas, encerra sessões e escreve notas. Não mexe em valores.</li>
      </ul>
    ),
    dicas: [<>A equipe nunca fica sem Dono: o último não pode ser removido nem rebaixado.</>],
    termos: ["equipe", "papéis", "dono", "financeiro", "suporte", "convidar", "permissões"],
  },
  {
    id: "cobranca-clinica",
    grupo: "plataforma",
    titulo: "Preço negociado, descontos, créditos e cupons",
    resumo: "Condições comerciais de cada clínica e cupons de desconto.",
    perfis: ["plataforma"],
    onde: "/plataforma/clinicas › aba Cobrança",
    link: "/plataforma/cupons",
    passos: [
      <>Abra a clínica e a aba {b("Cobrança")}. No alto, a {b("Próxima fatura (prévia)")} mostra como ela sairia hoje.</>,
      <>Em {b("Condições negociadas")}, preencha só o que muda: mensalidade, preços de excedente, {b("Dia de vencimento")} (1 a 28) e {b("Carência até suspender")}. Vazio segue o plano.</>,
      <>Em {b("Descontos")}, escolha percentual ou valor fixo por mês, a partir de qual mês e até quando (vazio = sem fim).</>,
      <>Em {b("Créditos")}, lance um abatimento avulso (ex.: compensação). Ele sai das próximas faturas até o saldo acabar.</>,
      <>Em {b("Cupons")} (menu da plataforma), crie códigos com valor, duração em meses, validade, limite de usos e planos. A clínica digita o cupom no cadastro ou na tela Assinatura, ou ele vem no convite de teste grátis.</>,
    ],
    midias: [
      { tipo: "print", nome: "90-clinica-cobranca", legenda: "Aba Cobrança: prévia, condições, descontos, créditos e faturas" },
      { tipo: "print", nome: "88-plataforma-cupons", legenda: "Cupons de desconto" },
    ],
    conteudo: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Tudo vale a partir da próxima fatura; faturas já emitidas não mudam (para elas, use as operações da fatura).</li>
        <li>Ordem do cálculo: preço negociado, desconto percentual, desconto em valor e créditos. A fatura nunca fica negativa.</li>
        <li>Fatura que fica em zero nasce quitada como {b("isenta")} e não vai ao Asaas.</li>
        <li>Um cupom por clínica de cada vez; o mesmo cupom não se usa duas vezes na mesma clínica.</li>
      </ul>
    ),
    termos: ["desconto", "cupom", "crédito", "preço negociado", "condição comercial", "dia de vencimento", "carência"],
  },
  {
    id: "faturas-plataforma",
    grupo: "plataforma",
    titulo: "Financeiro e operações na fatura",
    resumo: "Receita, inadimplência e o que fazer com uma fatura em aberto.",
    perfis: ["plataforma"],
    onde: "/plataforma/financeiro",
    link: "/plataforma/financeiro",
    passos: [
      <>Em {b("Financeiro")}, veja o {b("MRR estimado")} (a fatura do mês de cada clínica pagante, com condições e descontos), o recebido e o a receber no mês, a inadimplência por faixa e as clínicas em atraso com a data da suspensão.</>,
      <>Filtre por clínica, situação e vencimento; {b("CSV")} exporta o que está filtrado.</>,
      <>Em cada fatura em aberto: {b("Mudar vencimento")}, {b("Desconto ou acréscimo")}, {b("Baixa manual (pago fora)")}, {b("Cancelar fatura")} ou {b("Reenviar")}. Todas pedem motivo e ficam na auditoria da plataforma e da clínica.</>,
      <>Na aba {b("Cobrança")} da clínica, {b("Nova fatura avulsa")} cobra algo fora da mensalidade (implantação, treinamento…).</>,
    ],
    midias: [
      { tipo: "print", nome: "83-plataforma-financeiro", legenda: "Financeiro da plataforma" },
      { tipo: "print", nome: "91-fatura-acoes", legenda: "Operações numa fatura em aberto" },
    ],
    conteudo: (
      <ul className="list-disc space-y-1 pl-5">
        <li>O Asaas é atualizado primeiro (novo valor, nova data ou cancelamento); depois o Salus.</li>
        <li>Mudar o vencimento tira a clínica do atraso na hora, se a nova data ainda não passou.</li>
        <li>Na baixa manual a cobrança do Asaas é cancelada, para a clínica não pagar duas vezes. Se ela pagar mesmo assim, o pagamento fica registrado no histórico para devolução.</li>
        <li>{b("Reenviar")}: fatura com erro de envio volta para o Asaas; as outras vão por e-mail aos administradores da clínica.</li>
      </ul>
    ),
    termos: ["financeiro", "MRR", "inadimplência", "vencimento", "baixa manual", "cancelar fatura", "fatura avulsa", "reenviar"],
  },
  {
    id: "renegociacao",
    grupo: "plataforma",
    titulo: "Renegociar faturas em atraso",
    resumo: "Acordo em parcelas, com desconto opcional.",
    perfis: ["plataforma", "admin"],
    onde: "/plataforma/clinicas › aba Acordos",
    passos: [
      <>Abra a clínica, aba {b("Acordos")}, e clique em {b("Renegociar faturas em aberto")}.</>,
      <>Marque as faturas que entram, o desconto (percentual ou valor), o número de parcelas e o vencimento da primeira.</>,
      <>Confira a prévia: dá para mudar a data e o valor de cada parcela, desde que a soma feche com o total.</>,
      <>Informe o motivo e clique em {b("Confirmar acordo")}. As faturas originais são canceladas e cada parcela vira uma fatura enviada ao Asaas.</>,
    ],
    midias: [{ tipo: "print", nome: "92-clinica-acordos", legenda: "Acordo em 3 parcelas com desconto" }],
    conteudo: (
      <ul className="list-disc space-y-1 pl-5">
        <li>A clínica sai do atraso assim que o acordo é criado e vê as parcelas, com o link de pagamento, na tela Assinatura.</li>
        <li>Parcela em atraso segue a carência normal até suspender.</li>
        <li>Pagas todas as parcelas, o acordo fica {b("Quitado")} sozinho. Cancelar o acordo cancela as parcelas em aberto; as faturas originais não voltam.</li>
      </ul>
    ),
    termos: ["renegociar", "acordo", "parcelas", "parcelamento", "atraso", "inadimplência"],
  },
  {
    id: "teste-gratis",
    grupo: "plataforma",
    titulo: "Teste grátis para uma clínica",
    resumo: "Convite da equipe Salus que deixa uma clínica nova usar um plano de graça por alguns dias.",
    perfis: ["plataforma", "admin"],
    onde: "/plataforma/convites",
    link: "/plataforma/convites",
    passos: [
      <>Em {b("Convites")}, informe o e-mail de quem vai administrar a clínica, o {b("Plano do teste")}, os {b("Dias de teste grátis")} e por quantos dias o link vale.</>,
      <>Clique em {b("Gerar convite e enviar e-mail")}. O e-mail sai na hora; se não sair, copie o link que aparece na tela e envie você mesmo.</>,
      <>A pessoa abre o link, cria a conta (ou entra) com aquele e-mail e clica em {b("Cadastrar meu espaço")}.</>,
      <>O espaço já nasce no plano do convite, com o aviso {b("Teste grátis até…")} no painel e na Assinatura.</>,
      <>Para estender ou encerrar o teste, abra a clínica em {b("Clínicas")} e altere {b("Teste até")}.</>,
    ],
    midias: [
      { tipo: "print", nome: "85-plataforma-convites", legenda: "Convites de teste grátis enviados e a situação de cada um" },
      { tipo: "print", nome: "86-teste-gratis-link", legenda: "O que a clínica vê ao abrir o link" },
    ],
    conteudo: (
      <div className="flex flex-col gap-2">
        <p>{b("Como fica a cobrança")}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Durante o teste não sai nenhuma fatura do Salus.</li>
          <li>O mês em que o teste termina também não é cobrado: a primeira fatura é a do mês seguinte, com vencimento no dia 10.</li>
          <li>Os limites do plano valem desde o primeiro dia; o espaço pode trocar de plano quando quiser.</li>
          <li>Encerrar o teste pela ficha da clínica volta a cobrança já no mês atual.</li>
        </ul>
      </div>
    ),
    problemas: [
      { sintoma: `"Entre com o mesmo e-mail para o qual o convite foi enviado"`, solucao: <>O convite só vale para o e-mail convidado. Saia da conta e entre (ou cadastre-se) com ele, ou gere um convite novo para o outro e-mail.</> },
      { sintoma: "Sua conta já participa de um espaço", solucao: <>O convite serve para cadastrar um espaço novo. Para dar teste a um espaço que já existe, use {b("Teste até")} na ficha da clínica.</> },
      { sintoma: "Convite expirado", solucao: <>Gere outro em {b("Convites")}: o novo substitui o anterior do mesmo e-mail.</> },
    ],
    termos: ["teste grátis", "trial", "convite", "degustação", "período de teste", "sem cobrança"],
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
          ["Carência", "Os dias depois do vencimento da fatura (15, ou o combinado com a equipe Salus) antes de o espaço ficar só para consulta."],
          ["Acordo", "Faturas em atraso renegociadas em parcelas com a equipe Salus."],
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
