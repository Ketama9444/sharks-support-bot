module.exports = {
  branding: {
    name: 'Sharks FA',
    logo: 'https://i.ibb.co/DgHDx91G/aaaimage.png',
    color: 0x021F49,
    footer: 'Sharks FA • Support officiel'
  },

  // Les IDs sont détectés/créés automatiquement au démarrage.
  channels: {
    logsChannelId: '',
    transcriptsChannelId: '',
    ticketCategoryIds: {}
  },

  ticketCategories: [
    { id: 'general', emoji: '🦈', label: 'Support général', description: 'Question ou demande générale' },
    { id: 'bug', emoji: '🛠️', label: 'Bug en jeu', description: 'Bug, problème technique ou erreur FiveM' },
    { id: 'report', emoji: '🚨', label: 'Report joueur', description: 'Signaler un joueur ou une scène' },
    { id: 'legal', emoji: '🏢', label: 'Légal / Entreprise', description: 'Entreprise, gouvernement, services légaux' },
    { id: 'illegal', emoji: '🔫', label: 'Illégal / Faction', description: 'Gang, organisation ou dossier illégal' },
    { id: 'shop', emoji: '💳', label: 'Boutique / Paiement', description: 'Achat, paiement ou livraison boutique' },
    { id: 'refund', emoji: '💰', label: 'Remboursement', description: 'Demande de remboursement ou compensation' },
    { id: 'staff', emoji: '👮', label: 'Staff / Recrutement', description: 'Candidature staff ou sujet équipe' },
    { id: 'partner', emoji: '🤝', label: 'Partenariat', description: 'Créateur, streamer, serveur ou partenariat' }
  ],

  limits: {
    maxOpenTicketsPerUser: 1,
    autoArchiveAfterClose: true,
    transcriptMessageLimit: 1000
  }
};
