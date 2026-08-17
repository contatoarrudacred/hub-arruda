export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agenda_itens: {
        Row: {
          agenda_id: string
          canal: string
          conteudo: string
          created_at: string
          encerra_atendimento: boolean
          id: string
          intervalo_unidade: string
          intervalo_valor: number
          ordem: number
          respeita_janela_comercial: boolean
        }
        Insert: {
          agenda_id: string
          canal: string
          conteudo: string
          created_at?: string
          encerra_atendimento?: boolean
          id?: string
          intervalo_unidade: string
          intervalo_valor: number
          ordem: number
          respeita_janela_comercial?: boolean
        }
        Update: {
          agenda_id?: string
          canal?: string
          conteudo?: string
          created_at?: string
          encerra_atendimento?: boolean
          id?: string
          intervalo_unidade?: string
          intervalo_valor?: number
          ordem?: number
          respeita_janela_comercial?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agenda_itens_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "agendas_followup"
            referencedColumns: ["id"]
          },
        ]
      }
      agendas_followup: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      auditoria_log: {
        Row: {
          criado_em: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          operacao: string
          registro_id: string | null
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          operacao: string
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          operacao?: string
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      checklist_qa_itens: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          item: string
          peso: number
          propriedade_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          item: string
          peso?: number
          propriedade_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          item?: string
          peso?: number
          propriedade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_qa_itens_propriedade_id_fkey"
            columns: ["propriedade_id"]
            isOneToOne: false
            referencedRelation: "propriedades_digitais"
            referencedColumns: ["id"]
          },
        ]
      }
      cliques_rastreio: {
        Row: {
          codigo: string
          criado_em: string
          id: string
          idioma: string | null
          ip: string | null
          pessoa_id: string | null
          referer: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          codigo: string
          criado_em?: string
          id?: string
          idioma?: string | null
          ip?: string | null
          pessoa_id?: string | null
          referer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          codigo?: string
          criado_em?: string
          id?: string
          idioma?: string | null
          ip?: string | null
          pessoa_id?: string | null
          referer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliques_rastreio_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          atualizado_por: string | null
          chave: string
          descricao: string
          id: string
          produto_id: string | null
          unidade_negocio_id: string | null
          updated_at: string
          valor: Json
        }
        Insert: {
          atualizado_por?: string | null
          chave: string
          descricao: string
          id?: string
          produto_id?: string | null
          unidade_negocio_id?: string | null
          updated_at?: string
          valor: Json
        }
        Update: {
          atualizado_por?: string | null
          chave?: string
          descricao?: string
          id?: string
          produto_id?: string | null
          unidade_negocio_id?: string | null
          updated_at?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_sistema"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_unidade_negocio_id_fkey"
            columns: ["unidade_negocio_id"]
            isOneToOne: false
            referencedRelation: "unidades_negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_configuracoes_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          agenda_followup_id: string | null
          aguardando_resposta_desde: string | null
          atendente_id: string | null
          canal: string
          created_at: string
          dados: Json
          etapa_fluxo_atual_id: string | null
          favorita: boolean
          fluxo_id: string | null
          followup_manual_ativo: boolean
          id: string
          oportunidade_id: string | null
          pessoa_id: string
          proximo_item_agenda: number
          sob_supervisor: boolean
          status: string
          updated_at: string
        }
        Insert: {
          agenda_followup_id?: string | null
          aguardando_resposta_desde?: string | null
          atendente_id?: string | null
          canal: string
          created_at?: string
          dados?: Json
          etapa_fluxo_atual_id?: string | null
          favorita?: boolean
          fluxo_id?: string | null
          followup_manual_ativo?: boolean
          id?: string
          oportunidade_id?: string | null
          pessoa_id: string
          proximo_item_agenda?: number
          sob_supervisor?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          agenda_followup_id?: string | null
          aguardando_resposta_desde?: string | null
          atendente_id?: string | null
          canal?: string
          created_at?: string
          dados?: Json
          etapa_fluxo_atual_id?: string | null
          favorita?: boolean
          fluxo_id?: string | null
          followup_manual_ativo?: boolean
          id?: string
          oportunidade_id?: string | null
          pessoa_id?: string
          proximo_item_agenda?: number
          sob_supervisor?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_agenda_followup_id_fkey"
            columns: ["agenda_followup_id"]
            isOneToOne: false
            referencedRelation: "agendas_followup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "usuarios_sistema"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_etapa_fluxo_atual_id_fkey"
            columns: ["etapa_fluxo_atual_id"]
            isOneToOne: false
            referencedRelation: "etapas_fluxo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_locks: {
        Row: {
          id: string
          locked_until: string
        }
        Insert: {
          id: string
          locked_until: string
        }
        Update: {
          id?: string
          locked_until?: string
        }
        Relationships: []
      }
      enderecos: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          id: string
          logradouro: string | null
          numero: string | null
          pessoa_id: string
          tipo: string
          uf: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          id?: string
          logradouro?: string | null
          numero?: string | null
          pessoa_id: string
          tipo?: string
          uf?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          id?: string
          logradouro?: string | null
          numero?: string | null
          pessoa_id?: string
          tipo?: string
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enderecos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      entidades_legais: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          razao_social: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          razao_social: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          razao_social?: string
          updated_at?: string
        }
        Relationships: []
      }
      etapas_fluxo: {
        Row: {
          agenda_followup_id: string | null
          campo_salvo: string | null
          conteudo: Json
          created_at: string
          fluxo_id: string
          id: string
          ordem: number
          tipo_etapa: string
          updated_at: string
        }
        Insert: {
          agenda_followup_id?: string | null
          campo_salvo?: string | null
          conteudo: Json
          created_at?: string
          fluxo_id: string
          id?: string
          ordem: number
          tipo_etapa: string
          updated_at?: string
        }
        Update: {
          agenda_followup_id?: string | null
          campo_salvo?: string | null
          conteudo?: Json
          created_at?: string
          fluxo_id?: string
          id?: string
          ordem?: number
          tipo_etapa?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "etapas_fluxo_agenda_followup_id_fkey"
            columns: ["agenda_followup_id"]
            isOneToOne: false
            referencedRelation: "agendas_followup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_fluxo_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          pergunta: string
          produto_id: string
          resposta: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          pergunta: string
          produto_id: string
          resposta: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          pergunta?: string
          produto_id?: string
          resposta?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          produto_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          produto_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          produto_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_emails: {
        Row: {
          agenda_item_id: string
          conversa_id: string
          criado_em: string
          descricao: string
          destinatario_email: string | null
          id: string
          status: string
        }
        Insert: {
          agenda_item_id: string
          conversa_id: string
          criado_em?: string
          descricao: string
          destinatario_email?: string | null
          id?: string
          status?: string
        }
        Update: {
          agenda_item_id?: string
          conversa_id?: string
          criado_em?: string
          descricao?: string
          destinatario_email?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_emails_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "agenda_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_emails_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_emails_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_resumo"
            referencedColumns: ["conversa_id"]
          },
        ]
      }
      identidades_canal: {
        Row: {
          canal: string
          created_at: string
          id: string
          identificador_externo: string
          pessoa_id: string
          verificado: boolean
        }
        Insert: {
          canal: string
          created_at?: string
          id?: string
          identificador_externo: string
          pessoa_id: string
          verificado?: boolean
        }
        Update: {
          canal?: string
          created_at?: string
          id?: string
          identificador_externo?: string
          pessoa_id?: string
          verificado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "identidades_canal_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      matrizes_conteudo: {
        Row: {
          ativo: boolean
          created_at: string
          eixos: Json
          id: string
          nome: string
          propriedade_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          eixos?: Json
          id?: string
          nome: string
          propriedade_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          eixos?: Json
          id?: string
          nome?: string
          propriedade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matrizes_conteudo_propriedade_id_fkey"
            columns: ["propriedade_id"]
            isOneToOne: false
            referencedRelation: "propriedades_digitais"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          conteudo: string | null
          conversa_id: string
          entregue_em: string | null
          enviado_em: string
          etapa_fluxo_id: string | null
          id: string
          lido_em: string | null
          midia_tipo: string | null
          midia_url: string | null
          remetente: string
          zapster_message_id: string | null
        }
        Insert: {
          conteudo?: string | null
          conversa_id: string
          entregue_em?: string | null
          enviado_em?: string
          etapa_fluxo_id?: string | null
          id?: string
          lido_em?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          remetente: string
          zapster_message_id?: string | null
        }
        Update: {
          conteudo?: string | null
          conversa_id?: string
          entregue_em?: string | null
          enviado_em?: string
          etapa_fluxo_id?: string | null
          id?: string
          lido_em?: string | null
          midia_tipo?: string | null
          midia_url?: string | null
          remetente?: string
          zapster_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_resumo"
            referencedColumns: ["conversa_id"]
          },
          {
            foreignKeyName: "mensagens_etapa_fluxo_id_fkey"
            columns: ["etapa_fluxo_id"]
            isOneToOne: false
            referencedRelation: "etapas_fluxo"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_internas: {
        Row: {
          autor_id: string
          conversa_id: string
          created_at: string
          id: string
          texto: string
        }
        Insert: {
          autor_id: string
          conversa_id: string
          created_at?: string
          id?: string
          texto: string
        }
        Update: {
          autor_id?: string
          conversa_id?: string
          created_at?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_internas_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_sistema"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_internas_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_internas_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_resumo"
            referencedColumns: ["conversa_id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          conversa_id: string
          created_at: string
          id: string
          lida: boolean
          nota_id: string | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          id?: string
          lida?: boolean
          nota_id?: string | null
          tipo: string
          usuario_id: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
          id?: string
          lida?: boolean
          nota_id?: string | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas_resumo"
            referencedColumns: ["conversa_id"]
          },
          {
            foreignKeyName: "notificacoes_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_internas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_sistema"
            referencedColumns: ["id"]
          },
        ]
      }
      objecoes: {
        Row: {
          ativo: boolean
          como_lidar: string
          created_at: string
          id: string
          objecao: string
          produto_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          como_lidar: string
          created_at?: string
          id?: string
          objecao: string
          produto_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          como_lidar?: string
          created_at?: string
          id?: string
          objecao?: string
          produto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objecoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidade_documentos: {
        Row: {
          alto_valor: boolean
          created_at: string
          documento: string | null
          faixa_valor: string | null
          faixa_valor_detalhe: string | null
          id: string
          oportunidade_id: string
          tipo_documento: string
          updated_at: string
          valor_aproximado: number | null
          valor_restricao_estimado: number | null
        }
        Insert: {
          alto_valor?: boolean
          created_at?: string
          documento?: string | null
          faixa_valor?: string | null
          faixa_valor_detalhe?: string | null
          id?: string
          oportunidade_id: string
          tipo_documento: string
          updated_at?: string
          valor_aproximado?: number | null
          valor_restricao_estimado?: number | null
        }
        Update: {
          alto_valor?: boolean
          created_at?: string
          documento?: string | null
          faixa_valor?: string | null
          faixa_valor_detalhe?: string | null
          id?: string
          oportunidade_id?: string
          tipo_documento?: string
          updated_at?: string
          valor_aproximado?: number | null
          valor_restricao_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_documentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          alto_valor: boolean
          created_at: string
          etapa_kanban: string
          id: string
          motivo_perda: string | null
          pessoa_id: string
          produto_id: string
          sob_supervisor: boolean
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          alto_valor?: boolean
          created_at?: string
          etapa_kanban?: string
          id?: string
          motivo_perda?: string | null
          pessoa_id: string
          produto_id: string
          sob_supervisor?: boolean
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          alto_valor?: boolean
          created_at?: string
          etapa_kanban?: string
          id?: string
          motivo_perda?: string | null
          pessoa_id?: string
          produto_id?: string
          sob_supervisor?: boolean
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pautas: {
        Row: {
          angulo: string
          created_at: string
          funil: string
          geografia: string | null
          id: string
          matriz_conteudo_id: string
          motivo_ultima_reprovacao: string | null
          palavra_chave_principal: string
          palavras_secundarias: Json
          prioridade_score: number
          status: string
          tentativas: number
          tipo_conteudo: string
        }
        Insert: {
          angulo: string
          created_at?: string
          funil: string
          geografia?: string | null
          id?: string
          matriz_conteudo_id: string
          motivo_ultima_reprovacao?: string | null
          palavra_chave_principal: string
          palavras_secundarias?: Json
          prioridade_score?: number
          status?: string
          tentativas?: number
          tipo_conteudo?: string
        }
        Update: {
          angulo?: string
          created_at?: string
          funil?: string
          geografia?: string | null
          id?: string
          matriz_conteudo_id?: string
          motivo_ultima_reprovacao?: string | null
          palavra_chave_principal?: string
          palavras_secundarias?: Json
          prioridade_score?: number
          status?: string
          tentativas?: number
          tipo_conteudo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pautas_matriz_conteudo_id_fkey"
            columns: ["matriz_conteudo_id"]
            isOneToOne: false
            referencedRelation: "matrizes_conteudo"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoa_papeis: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string
          id: string
          pessoa_id: string
          status: string
          tipo_papel: string
          unidade_negocio_id: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          pessoa_id: string
          status?: string
          tipo_papel: string
          unidade_negocio_id: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          pessoa_id?: string
          status?: string
          tipo_papel?: string
          unidade_negocio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_papeis_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_papeis_unidade_negocio_id_fkey"
            columns: ["unidade_negocio_id"]
            isOneToOne: false
            referencedRelation: "unidades_negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoa_representantes: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string
          id: string
          papel_representacao: string
          pessoa_fisica_id: string
          pessoa_juridica_id: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          papel_representacao?: string
          pessoa_fisica_id: string
          pessoa_juridica_id: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          papel_representacao?: string
          pessoa_fisica_id?: string
          pessoa_juridica_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_representantes_pessoa_fisica_id_fkey"
            columns: ["pessoa_fisica_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_representantes_pessoa_juridica_id_fkey"
            columns: ["pessoa_juridica_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          created_at: string
          data_nascimento_fundacao: string | null
          documento: string | null
          email: string | null
          email_boas_vindas_enviado: boolean
          email_marketing_opt_out: boolean
          id: string
          nome_razao_social: string
          tipo_pessoa: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          data_nascimento_fundacao?: string | null
          documento?: string | null
          email?: string | null
          email_boas_vindas_enviado?: boolean
          email_marketing_opt_out?: boolean
          id?: string
          nome_razao_social: string
          tipo_pessoa: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          data_nascimento_fundacao?: string | null
          documento?: string | null
          email?: string | null
          email_boas_vindas_enviado?: boolean
          email_marketing_opt_out?: boolean
          id?: string
          nome_razao_social?: string
          tipo_pessoa?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      posts: {
        Row: {
          atualizado_em: string
          canais: Json
          conteudo_html: string
          created_at: string
          id: string
          imagem_destaque_url: string | null
          meta_description: string
          meta_title: string
          pauta_id: string
          propriedade_id: string
          publicado_em: string | null
          score_qa: number | null
          slug: string
          status: string
          tentativas: number
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          canais?: Json
          conteudo_html: string
          created_at?: string
          id?: string
          imagem_destaque_url?: string | null
          meta_description: string
          meta_title: string
          pauta_id: string
          propriedade_id: string
          publicado_em?: string | null
          score_qa?: number | null
          slug: string
          status?: string
          tentativas?: number
          titulo: string
        }
        Update: {
          atualizado_em?: string
          canais?: Json
          conteudo_html?: string
          created_at?: string
          id?: string
          imagem_destaque_url?: string | null
          meta_description?: string
          meta_title?: string
          pauta_id?: string
          propriedade_id?: string
          publicado_em?: string | null
          score_qa?: number | null
          slug?: string
          status?: string
          tentativas?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_pauta_id_fkey"
            columns: ["pauta_id"]
            isOneToOne: false
            referencedRelation: "pautas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_propriedade_id_fkey"
            columns: ["propriedade_id"]
            isOneToOne: false
            referencedRelation: "propriedades_digitais"
            referencedColumns: ["id"]
          },
        ]
      }
      precos_por_faixa: {
        Row: {
          ativo: boolean
          faixa_max: number | null
          faixa_min: number
          id: string
          parcelas_boleto_qtd: number | null
          parcelas_boleto_valor: number | null
          parcelas_cartao_max: number | null
          preco_avista: number | null
          preco_cheio: number | null
          produto_id: string
          updated_at: string
          voucher_avista: number | null
          voucher_parcelas_qtd: number | null
          voucher_parcelas_valor: number | null
        }
        Insert: {
          ativo?: boolean
          faixa_max?: number | null
          faixa_min: number
          id?: string
          parcelas_boleto_qtd?: number | null
          parcelas_boleto_valor?: number | null
          parcelas_cartao_max?: number | null
          preco_avista?: number | null
          preco_cheio?: number | null
          produto_id: string
          updated_at?: string
          voucher_avista?: number | null
          voucher_parcelas_qtd?: number | null
          voucher_parcelas_valor?: number | null
        }
        Update: {
          ativo?: boolean
          faixa_max?: number | null
          faixa_min?: number
          id?: string
          parcelas_boleto_qtd?: number | null
          parcelas_boleto_valor?: number | null
          parcelas_cartao_max?: number | null
          preco_avista?: number | null
          preco_cheio?: number | null
          produto_id?: string
          updated_at?: string
          voucher_avista?: number | null
          voucher_parcelas_qtd?: number | null
          voucher_parcelas_valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "precos_por_faixa_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          created_at: string
          fonte_receita: string
          id: string
          nome: string
          nome_reduzido: string | null
          parceiro_executor: string | null
          tipo: string
          unidade_negocio_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          fonte_receita: string
          id?: string
          nome: string
          nome_reduzido?: string | null
          parceiro_executor?: string | null
          tipo: string
          unidade_negocio_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          fonte_receita?: string
          id?: string
          nome?: string
          nome_reduzido?: string | null
          parceiro_executor?: string | null
          tipo?: string
          unidade_negocio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_unidade_negocio_id_fkey"
            columns: ["unidade_negocio_id"]
            isOneToOne: false
            referencedRelation: "unidades_negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      propriedades_digitais: {
        Row: {
          ativo: boolean
          config_pipeline: Json
          created_at: string
          id: string
          nome: string
          pessoa_id: string | null
          tipo_cms: string
          unidade_negocio_id: string | null
          updated_at: string
          url_base: string
        }
        Insert: {
          ativo?: boolean
          config_pipeline?: Json
          created_at?: string
          id?: string
          nome: string
          pessoa_id?: string | null
          tipo_cms?: string
          unidade_negocio_id?: string | null
          updated_at?: string
          url_base: string
        }
        Update: {
          ativo?: boolean
          config_pipeline?: Json
          created_at?: string
          id?: string
          nome?: string
          pessoa_id?: string | null
          tipo_cms?: string
          unidade_negocio_id?: string | null
          updated_at?: string
          url_base?: string
        }
        Relationships: [
          {
            foreignKeyName: "propriedades_digitais_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propriedades_digitais_unidade_negocio_id_fkey"
            columns: ["unidade_negocio_id"]
            isOneToOne: false
            referencedRelation: "unidades_negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_prontas: {
        Row: {
          atalho: string
          ativo: boolean
          created_at: string
          id: string
          texto: string
          updated_at: string
        }
        Insert: {
          atalho: string
          ativo?: boolean
          created_at?: string
          id?: string
          texto: string
          updated_at?: string
        }
        Update: {
          atalho?: string
          ativo?: boolean
          created_at?: string
          id?: string
          texto?: string
          updated_at?: string
        }
        Relationships: []
      }
      unidades_negocio: {
        Row: {
          ativo: boolean
          created_at: string
          entidade_legal_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          entidade_legal_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          entidade_legal_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_negocio_entidade_legal_id_fkey"
            columns: ["entidade_legal_id"]
            isOneToOne: false
            referencedRelation: "entidades_legais"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_sistema: {
        Row: {
          ativo: boolean
          auth_user_id: string | null
          cor_badge: string
          created_at: string
          email: string
          id: string
          nivel_acesso: string
          pessoa_id: string
          ultimo_login_at: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auth_user_id?: string | null
          cor_badge?: string
          created_at?: string
          email: string
          id?: string
          nivel_acesso?: string
          pessoa_id: string
          ultimo_login_at?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auth_user_id?: string | null
          cor_badge?: string
          created_at?: string
          email?: string
          id?: string
          nivel_acesso?: string
          pessoa_id?: string
          ultimo_login_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_sistema_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      conversas_resumo: {
        Row: {
          atendente_cor: string | null
          atendente_id: string | null
          atendente_nome: string | null
          canal: string | null
          conversa_id: string | null
          created_at: string | null
          etapa_kanban: string | null
          favorita: boolean | null
          nao_lidas_contagem: number | null
          oportunidade_id: string | null
          pessoa_id: string | null
          pessoa_nome: string | null
          pessoa_telefone: string | null
          produto_nome: string | null
          produto_nome_reduzido: string | null
          sob_supervisor: boolean | null
          status: string | null
          ultima_mensagem_conteudo: string | null
          ultima_mensagem_em: string | null
          ultima_mensagem_entregue_em: string | null
          ultima_mensagem_lido_em: string | null
          ultima_mensagem_remetente: string | null
          valor_estimado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "usuarios_sistema"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_liberar_lock_cron: { Args: { p_id: string }; Returns: undefined }
      fn_tentar_lock_cron: {
        Args: { p_duracao_segundos: number; p_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
