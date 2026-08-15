-- ============================================================================
-- MIGRATION 010 — Banco de objeções V2 (dados reais de Luiz)
-- Sistema de Gestão ArrudaCred
--
-- Conteúdo trazido por Luiz em 15/08/2026: 50 objeções reais do produto
-- Limpeza de Nome (CPF/CNPJ), organizadas em 7 categorias (medo/confiança,
-- reputação, preço/concorrência, dinheiro/pagamento, adiamento, terceiros,
-- desistência), com resposta sugerida e estratégia por item. A framework
-- que acompanha o documento (dúvida vs. objeção vs. objeção-cortina,
-- princípio ACOLHER→DIAGNOSTICAR→..., e as 10 regras de ouro) NÃO entra
-- aqui como linha — isso é comportamento geral da IA, registrado no
-- prompt de sistema (PERSONA_MALALA_PROMPT_SISTEMA.md), não uma objeção
-- específica.
--
-- Busca o produto pelo nome em vez de hardcodar o id (o id de produtos
-- pode variar entre ambientes, já que o seed local gera UUIDs novos a
-- cada execução) — assim a migration funciona igual em qualquer ambiente
-- onde esse produto já exista com esse nome.
-- ============================================================================

insert into objecoes (produto_id, objecao, como_lidar)
select p.id, v.objecao, v.como_lidar
from produtos p,
(values

-- A. Medo / insegurança / confiança
($o$Tenho medo de ser golpe.$o$, $c$Objetivo: transformar "confie em mim" em "verifique você mesmo".
"E você está certo em ter esse cuidado. Principalmente nesse segmento, eu também pesquisaria bastante antes de contratar.
Por isso eu não quero que você simplesmente confie no que estou falando.
Pesquise a ArrudaCred no Google, veja nosso Reclame Aqui, nosso CNPJ, histórico, canais oficiais e contrato.
👉 Mas me conta uma coisa: o que especificamente ainda está te deixando inseguro?"
Estratégia: descobrir o medo específico antes de continuar argumentando.$c$),

($o$Tenho medo de pagar e vocês sumirem.$o$, $c$"Entendo perfeitamente.
E é justamente por isso que eu prefiro te mostrar fatos em vez de simplesmente pedir confiança.
Você consegue verificar nossa empresa, CNPJ, avaliações no Google, Reclame Aqui, histórico, canais oficiais e contrato.
Uma empresa deixa rastros ao longo dos anos. E é isso que eu quero que você analise."
Fechamento: "Se sua preocupação era saber se existe uma empresa séria por trás do atendimento, o que ainda falta para você se sentir seguro?"$c$),

($o$Tenho medo de pagar e não funcionar.$o$, $c$"Esse receio é compreensível.
Por isso nossa segurança não está baseada numa promessa de 'vai dar certo porque eu estou dizendo'.
Existem contrato, experiência, reputação e garantias previstas para o serviço.
Inclusive, quando aplicável, existe proteção para reinserções e previsão contratual de devolução de 50% do valor pago em caso de insucesso, conforme os termos do contrato.
👉 Sabendo disso, o que ainda te deixa inseguro?"$c$),

($o$Já caí em golpe antes.$o$, $c$"Então sua cautela faz ainda mais sentido.
Mas uma experiência ruim não precisa impedir você de resolver um problema. Ela precisa aumentar seu critério para escolher quem vai te ajudar.
Não quero que você acredite em mim simplesmente porque estou dizendo.
Confira Google, Reclame Aqui, CNPJ, contrato e histórico da ArrudaCred.
👉 O que você precisaria verificar para se sentir seguro desta vez?"$c$),

($o$Não confio nesse negócio de limpeza de nome.$o$, $c$"Tudo bem. E eu prefiro que você questione antes de contratar.
O que exatamente gera sua desconfiança: o funcionamento do serviço, medo de pagar e não ter resultado ou alguma experiência que você ou alguém próximo já teve?"
Estratégia: não responder antes de descobrir a origem da desconfiança.$c$),

($o$Conheço alguém que fez e deu errado.$o$, $c$"Entendo por que isso gera insegurança.
Mas deixa eu fazer uma comparação.
Imagine que você vai a um restaurante e recebe uma comida estragada. Você nunca mais vai comer em restaurante ou passa a escolher melhor onde vai?
Aqui existe uma lógica parecida.
Uma experiência ruim mostra principalmente a importância de escolher bem quem vai cuidar do problema.
Por isso eu quero que você compare contrato, reputação, experiência, atendimento e garantias — não apenas o nome do serviço."$c$),

($o$Meu amigo limpou o nome e depois voltou tudo.$o$, $c$"Entendo perfeitamente seu receio.
E eu não vou esconder de você que reinserções podem acontecer.
É justamente por conhecermos esse risco que temos proteção/garantia para reinserções dentro das condições previstas.
Voltando à comparação do restaurante: uma experiência ruim não significa que você nunca mais deva ir a um restaurante. Significa que precisa escolher melhor onde vai.
Aqui também: o problema não é conhecer alguém que teve uma experiência ruim. É escolher quem vai estar ao seu lado se surgir algum problema."$c$),

($o$Tenho medo de assinar e me arrepender.$o$, $c$"Então não quero que você assine enquanto existir uma dúvida importante.
Me diga exatamente o que poderia fazer você se arrepender: o investimento, medo do resultado, alguma cláusula ou alguma coisa que ainda não ficou clara?
👉 Vamos resolver esse ponto primeiro."$c$),

($o$Não sei se posso confiar em vocês.$o$, $c$"E confiança não deveria nascer porque eu pedi para você confiar.
Ela precisa ser construída.
Por isso eu prefiro que você olhe os fatos: reputação no Google e Reclame Aqui, histórico, CNPJ, contrato, experiência e atendimento.
👉 Qual desses pontos você ainda gostaria de verificar melhor?"$c$),

($o$Tenho medo porque tudo está sendo feito pelo WhatsApp.$o$, $c$"Entendo.
WhatsApp é apenas o nosso canal de atendimento. A empresa existe fora dele.
Você pode verificar CNPJ, site, Google, Reclame Aqui, canais oficiais e toda a formalização contratual.
👉 Sua preocupação era confirmar se existe realmente uma empresa por trás deste atendimento?"$c$),

-- B. Reputação / Reclame Aqui
($o$Vi reclamações de vocês no Reclame Aqui e fiquei com medo.$o$, $c$"E eu acho ótimo você ter pesquisado. Eu faria exatamente a mesma coisa.
Só sugiro analisar o conjunto, e não simplesmente se existem reclamações.
Veja nossa nota, como respondemos, como tratamos os problemas e coloque a quantidade de reclamações em perspectiva com o volume de clientes atendidos.
Hoje temos nota 9,5/10 no Reclame Aqui e 4,9/5 no Google.
👉 Teve alguma reclamação específica que realmente te preocupou? Me diga qual foi e eu tento esclarecer."$c$),

($o$Tem gente falando mal de vocês.$o$, $c$"Uma empresa que atende muita gente inevitavelmente pode ter clientes insatisfeitos.
O que eu acho importante é você não ignorar essas pessoas, mas também não analisar um caso isolado como se representasse milhares de atendimentos.
Veja o conjunto da reputação.
👉 Foi alguma situação específica que você encontrou que te deixou inseguro?"$c$),

($o$Vi cliente dizendo que o serviço não funcionou.$o$, $c$"E esse é justamente um ponto em que prefiro transparência.
Pode existir insucesso. A diferença está também em saber o que acontece quando o resultado esperado não vem.
É por isso que existem regras e proteções contratuais, inclusive, quando aplicável, previsão de devolução de 50% do valor pago em caso de insucesso, conforme os termos do contrato.
Eu prefiro te mostrar como lidamos com o risco a simplesmente fingir que risco não existe."$c$),

($o$Não confio nessas avaliações.$o$, $c$"É justo questionar.
Então não baseie sua decisão apenas nas avaliações.
Cruze as informações: Google, Reclame Aqui, CNPJ, site, redes sociais, contrato, histórico e a própria qualidade das respostas que você está recebendo aqui.
Não existe um único indicador que você precise aceitar cegamente."$c$),

($o$Vocês não são conhecidos.$o$, $c$"Pode ser que você ainda não conhecesse a ArrudaCred.
Mas mais importante do que reconhecer uma marca é conseguir verificar quem está por trás dela.
Veja nosso histórico, avaliações, CNPJ, contrato e presença pública.
👉 Depois de pesquisar, existe algum ponto específico sobre nossa empresa que ainda te preocupa?"$c$),

-- C. Preço / valor / concorrência
($o$Está caro.$o$, $c$NÃO defender o preço imediatamente.
Primeira resposta: "Entendo. Mas deixa eu te fazer uma pergunta importante:
👉 Caro em relação a quê?
Você encontrou outra empresa mais barata, o valor ficou pesado para o seu orçamento agora ou ainda não enxergou segurança/valor suficiente para investir isso?"
Regra: a resposta determina a quebra correta.$c$),

($o$Outra empresa faz muito mais barato.$o$, $c$Primeira resposta: "Entendi. Posso te fazer uma pergunta bem direta?
👉 Se o nosso preço e o dessa empresa fossem exatamente iguais, qual das duas você escolheria hoje?"
Se responder ArrudaCred: "Então isso me mostra uma coisa importante: quando tiramos o preço da decisão, você percebe mais valor ou segurança aqui.
Então talvez nossa questão não seja descobrir qual você prefere. É entender se conseguimos fazer a opção que você prefere caber no seu orçamento."
Depois investigar pagamento.$c$),

($o$Fulano cobra R$ 500 e vocês R$ 3.000.$o$, $c$"Entendi. Então vamos tirar o dinheiro da equação por alguns segundos.
Imagine que eu pudesse te presentear hoje e você não fosse pagar absolutamente nada.
👉 Você preferiria ganhar a limpeza de nome dele, que normalmente custa R$ 500, ou a nossa, que custa R$ 3.000?"
Se escolher ArrudaCred: "Percebe o que aconteceu? Quando você deixou de pagar, escolheu pelo serviço em que percebe mais valor e segurança.
Então talvez a questão não seja qual serviço você quer. A questão é como fazer a opção que você prefere caber no seu orçamento. 👉 É isso?"
Regra: usar como exercício de percepção de valor, nunca para humilhar concorrente.$c$),

($o$Achei outro mais barato e vou fechar com ele.$o$, $c$"Claro, a decisão é sua.
Só antes de decidir pelo preço, deixa eu te perguntar:
👉 Se os dois custassem exatamente o mesmo valor, você ainda escolheria essa outra empresa?"
Se SIM, respeitar e investigar somente se houver motivo útil.
Se NÃO: "Então o preço está fazendo você escolher uma empresa diferente daquela em que você sente mais confiança. Isso não significa que você tenha que contratar conosco. Mas vale colocar essa diferença de segurança na conta antes de decidir."$c$),

($o$Por que eu pagaria mais caro com vocês?$o$, $c$"Essa é uma ótima pergunta.
Eu não acho que você deva pagar mais simplesmente porque somos a ArrudaCred.
Você deveria pagar mais somente se perceber mais valor no conjunto: experiência, conhecimento técnico, contrato, reputação, atendimento, suporte e garantias.
👉 Se o preço fosse exatamente igual ao dos concorrentes que você pesquisou, quem você escolheria?"$c$),

($o$É tudo a mesma coisa. Só muda o preço.$o$, $c$"Se fosse realmente tudo igual, eu concordaria com você: faria sentido escolher o menor preço.
Mas deixa eu te perguntar:
👉 Você verificou se são iguais também em contrato, garantias, reputação no Google e Reclame Aqui, experiência, suporte e acompanhamento?
Porque, se tudo isso também for igual, aí temos uma comparação realmente justa."$c$),

($o$Vocês são muito mais caros que a concorrência.$o$, $c$"Pode acontecer de você encontrar preços bem menores.
Nós não precisamos ser os mais baratos.
Precisamos entregar uma estrutura que faça você entender por que escolheu a ArrudaCred.
👉 Tirando o preço por um instante, em qual das empresas que você pesquisou você se sente mais seguro para colocar seu nome e seu dinheiro?"$c$),

($o$Não acho que vale esse valor.$o$, $c$"Entendi. Então quero voltar ao começo da nossa conversa.
Você nos procurou porque [recuperar a dor/objetivo que o próprio lead declarou na conversa].
👉 Se você não resolver isso agora, o que acontece com [objetivo]?"
Depois: "Então talvez a comparação não seja simplesmente entre pagar ou não pagar. É entre o custo de resolver e o custo de continuar com o problema."
Nunca inventar a dor — usar só o que o lead já contou.$c$),

($o$É muito dinheiro só para limpar o nome.$o$, $c$"Entendo quando você olha somente para o número.
Mas deixa eu devolver uma pergunta:
👉 O que esse problema está te impedindo de fazer hoje?"
Usar somente o que o lead responder. Depois: "Então é isso que precisamos colocar na conta. O serviço tem um custo. Continuar com o problema também pode ter."$c$),

($o$Quero desconto.$o$, $c$"Eu entendo 😊. Eu também perguntaria.
Mas não tenho autorização para criar preço ou desconto diferente do que o sistema apresentou.
O que eu consigo fazer é entender se o problema é realmente o valor ou a forma de pagamento.
👉 Se conseguirmos encaixar esse investimento no seu fluxo, o restante está resolvido?"
Nunca inventar desconto — preço vem sempre do mecanismo determinístico do sistema.$c$),

($o$Se fizer por R$ X eu fecho agora.$o$, $c$"Eu não consigo alterar o preço para criar uma condição que não existe.
Mas você acabou de me dizer uma coisa importante: existe intenção de fechar.
👉 Se o problema for encaixar o pagamento, e não o serviço em si, podemos tentar resolver exatamente essa parte. É isso que está te impedindo?"$c$),

($o$Vou esperar uma promoção.$o$, $c$"Pode ser uma opção.
Só existe uma coisa que vale colocar na conta: enquanto você espera uma condição futura que hoje não sabemos qual será, [dor declarada pelo lead] continua existindo.
👉 Para você, hoje custa mais esperar ou resolver?"
Regra: nunca inventar promoção futura, prazo ou escassez que não exista de verdade.$c$),

($o$Vou pesquisar outros preços primeiro.$o$, $c$"Eu acho correto pesquisar.
Só faça uma comparação completa: preço, contrato, garantias, reputação, experiência e suporte.
E deixo uma pergunta para te ajudar nessa comparação:
👉 Se todos cobrassem exatamente o mesmo valor, qual empresa você escolheria?
Essa resposta provavelmente mostra o que realmente importa para você além do preço."$c$),

-- D. Dinheiro / capacidade de pagamento
($o$Não tenho dinheiro agora.$o$, $c$"Entendi.
Então preciso separar duas coisas: você não quer assumir esse investimento ou quer resolver, mas o dinheiro não está disponível hoje?
👉 Se conseguirmos encaixar o pagamento no seu fluxo, existe mais alguma coisa impedindo você de seguir?"$c$),

($o$Só recebo daqui alguns dias.$o$, $c$"Então talvez tenhamos encontrado a única barreira.
👉 Se eu conseguir verificar uma condição em que formalizamos seu contrato hoje e o primeiro pagamento fique para quando você receber, você fecha comigo hoje?"
Somente após SIM verificar a possibilidade. Limite absoluto: máximo 15 dias.$c$),

($o$Não consigo pagar a primeira parcela hoje.$o$, $c$"Entendi.
Antes de eu verificar qualquer possibilidade, quero confirmar:
👉 Tirando a data da primeira parcela, existe mais alguma coisa que impediria você de assinar hoje?"
Se NÃO: "Então, se eu conseguir programar o primeiro pagamento dentro da data autorizada, conseguimos formalizar hoje?"$c$),

($o$Esse mês estou muito apertado.$o$, $c$"Eu entendo.
Só preciso saber se estamos falando de impossibilidade financeira ou de fluxo de caixa.
👉 Se a primeira parcela pudesse ficar para uma data em que você tenha disponibilidade, isso resolveria ou ainda ficaria pesado para você?"$c$),

($o$Tenho muitas contas.$o$, $c$"E eu não quero te incentivar a assumir uma parcela que você realmente não consiga pagar.
Mas também precisamos colocar na balança o motivo que fez você chegar até nós.
Você me contou que [dor/objetivo que o lead já declarou].
👉 O que custa mais caro hoje: uma parcela que caiba no seu orçamento ou continuar com esse problema impedindo/dificultando [objetivo]?"$c$),

($o$Não cabe no meu orçamento.$o$, $c$"Se realmente não cabe, precisamos respeitar isso.
Mas antes quero entender:
👉 Não cabe mesmo parcelado ou o problema é a data em que começaria a pagar?
São situações diferentes e talvez uma delas tenha solução."$c$),

($o$Meu cartão não tem limite.$o$, $c$"Entendi.
Então isso parece ser uma dificuldade operacional de pagamento, e não uma objeção ao serviço.
👉 Se encontrarmos outra modalidade disponível que caiba no seu orçamento, você consegue seguir?"
Depois usar somente modalidades autorizadas pelo sistema.$c$),

($o$Preciso esperar virar o cartão.$o$, $c$"Entendi.
👉 Tirando a virada do cartão, existe algum outro motivo impedindo você de fechar?"
Se NÃO, verificar data e condição autorizadas.$c$),

($o$Só consigo pagar no dia X.$o$, $c$"Perfeito. Então já temos uma informação objetiva.
👉 Se conseguirmos programar o primeiro pagamento para o dia X dentro das condições autorizadas, conseguimos formalizar seu contrato hoje?"
Regra: nunca ultrapassar 15 dias.$c$),

($o$Agora tenho outras prioridades.$o$, $c$"Entendo. Então estamos falando de prioridade.
Você nos procurou porque [dor/objetivo declarado pelo lead].
👉 Se você adiar essa solução, esse problema pode esperar sem prejudicar aquilo que você quer fazer?"
Se SIM, respeitar.
Se NÃO: "Então talvez não seja uma questão de isso não ser prioridade. Talvez seja encontrar uma forma de encaixar a solução entre as prioridades que você já tem."$c$),

-- E. Adiamento / objeções-cortina (motivo não revelado — diagnosticar, nunca presumir)
($o$Vou pensar.$o$, $c$"Claro. Só quero te ajudar a pensar na coisa certa 😊.
👉 Quando você diz que precisa pensar, o que está pesando mais hoje: segurança no serviço, investimento ou alguma outra coisa que ainda não ficou clara?"
Regra: nunca presumir o motivo.$c$),

($o$Depois eu te chamo.$o$, $c$"Sem problema.
Mas me ajuda com uma coisa antes:
👉 O que precisa mudar entre hoje e esse 'depois' para você conseguir decidir?"$c$),

($o$Me chama mês que vem.$o$, $c$"Posso entender.
👉 O que vai estar diferente no mês que vem?
É uma questão financeira, você precisa resolver alguma coisa antes ou ainda não se sente seguro para contratar?"$c$),

($o$Vou esperar mais um pouco.$o$, $c$"Claro.
👉 O que você espera que mude nesse período?
Pergunto porque, se for algo que eu consiga resolver agora, talvez você não precise continuar adiando. Se realmente fizer sentido esperar, eu respeito."$c$),

($o$Não quero decidir hoje.$o$, $c$"Tudo bem. Eu não quero que você decida sem segurança.
Mas decisão e segurança são coisas diferentes de adiamento.
👉 O que ainda falta para você conseguir dizer conscientemente 'sim' ou 'não'?"$c$),

($o$Vou pesquisar mais.$o$, $c$"Ótimo. Pesquisa ajuda a tomar uma decisão mais segura.
👉 O que você ainda precisa descobrir?
Se for alguma informação sobre nós ou sobre o serviço, talvez eu consiga esclarecer agora. Se quiser comparar empresas, compare também contrato, garantias, reputação e suporte — não apenas preço."$c$),

-- F. Terceiros / decisão compartilhada
($o$Preciso falar com meu marido/minha esposa.$o$, $c$"Claro. Se essa decisão envolve vocês dois, faz sentido conversar.
Só quero te ajudar a chegar nessa conversa com todas as informações.
👉 O que você acha que ele(a) vai querer saber ou questionar?"
Depois: "E da sua parte, se ele(a) estiver de acordo, existe alguma outra coisa que te impediria de seguir?"$c$),

($o$Meu marido/minha esposa vai achar caro.$o$, $c$"Entendi.
Então talvez a principal questão que vocês precisem discutir seja investimento versus valor.
👉 Se o preço fosse exatamente o mesmo das outras empresas que você pesquisou, você escolheria a ArrudaCred?"
Se SIM: "Então você já sabe qual opção te transmite mais segurança. A conversa agora é entender se conseguimos encaixar essa opção no orçamento de vocês."$c$),

($o$Preciso falar com meu sócio.$o$, $c$"Faz sentido.
👉 Qual você acha que vai ser a principal preocupação dele: preço, segurança, funcionamento ou prazo?
Se eu souber, consigo deixar você com as informações certas para vocês decidirem juntos."
Depois: "E da sua parte, existe alguma objeção ou você seguiria se ele estiver de acordo?"$c$),

($o$Minha família está dizendo para eu não fazer.$o$, $c$"Entendo. Provavelmente estão tentando te proteger.
Eu não pediria para você dizer simplesmente 'confia'.
Mostre fatos: empresa, CNPJ, contrato, Google, Reclame Aqui, histórico e garantias.
👉 O que especificamente deixou sua família preocupada?
Se eu souber, consigo te ajudar a avaliar se a preocupação procede ou esclarecer o que estiver faltando."$c$),

($o$Preciso orar/pedir uma direção a Deus.$o$, $c$"Claro. Se sua fé faz parte da forma como você toma decisões importantes, eu respeito isso.
Só quero garantir que você tenha também todas as informações objetivas necessárias para refletir com tranquilidade.
👉 Ficou alguma dúvida ou insegurança sobre a empresa, o serviço, contrato, garantias ou investimento que eu possa esclarecer antes?"
Regra: jamais tentar usar a fé do lead para pressioná-lo ou induzir uma decisão.$c$),

-- G. Desistência / inércia
($o$Quer saber? Acho melhor deixar meu nome como está.$o$, $c$"Claro. A decisão é sua e eu vou respeitar.
Mas antes de encerrarmos, quero te devolver uma coisa que você mesmo me contou.
Você chegou até nós porque [dor/objetivo declarado pelo lead].
Se você deixar tudo como está, essa situação também continua como está.
Então deixa eu te fazer uma última pergunta:
👉 O que custa mais caro para você hoje: encontrar uma forma viável de resolver esse problema ou continuar pagando o preço de conviver com ele?
Se mesmo colocando isso na balança você entender que agora não é o momento, tudo bem. Mas quero que sua decisão seja tomada olhando o problema inteiro."$c$)

) as v(objecao, como_lidar)
where p.nome = 'Limpeza de Nome (CPF/CNPJ) — Serasa/SPC';

-- ============================================================================
-- Fim da migration 010.
-- ============================================================================
