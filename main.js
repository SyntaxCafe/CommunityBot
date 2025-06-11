// Load environment variables from .env file
require('dotenv').config();

// Import necessary classes and methods from discord.js and node-fetch
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Partials,
  ActivityType,
  ComponentType,
  SlashCommandBuilder,
  PermissionFlagsBits,
  REST,
  Routes
} = require('discord.js');
const fetch = require('node-fetch');

// Create a new Discord client instance with necessary intents and partials
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // For guild-related events
    GatewayIntentBits.GuildMessages, // For message events
    GatewayIntentBits.MessageContent, // To read message content
    GatewayIntentBits.GuildMembers // To fetch and manage members
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction] // Enable partials for handling uncached items
});

// Configuration variables from .env
const VERIFY_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID;
const VERIFY_ROLE_ID = process.env.ROLE_COMMUNITY_MEMBER;
const VERIFY_LOG_CHANNEL = process.env.VERIFICATION_LOG;
const MODERATION_ROLE_ID = process.env.ROLE_COMMUNITY_STAFF;
const MODERATION_LOG_CHANNEL = process.env.MODERATION_LOG;

// Variables to handle captcha system
let currentMessage = null;
let currentCaptcha = null;
let rotationInterval = null;

/**
 * Generates a simple math captcha (adds two numbers between 1 and 9)
 * Returns an object containing the question and its correct answer
 */
function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const result = num1 + num2;
  if (result > 9) return generateCaptcha(); // Ensure the result is a single digit
  return { question: `${num1} + ${num2}`, answer: result };
}

/**
 * Shuffles an array (used to randomize captcha buttons)
 */
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

/**
 * Creates two rows of buttons for the captcha with one correct answer
 */
function createButtonRow(answer) {
  const buttons = [];
  for (let i = 1; i <= 9; i++) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`captcha_${i === answer ? 'correct' : 'wrong'}_${i}`) // Mark correct or wrong
        .setLabel(`${i}`)
        .setStyle(ButtonStyle.Secondary)
    );
  }
  const shuffled = shuffle(buttons);
  return [
    new ActionRowBuilder().addComponents(...shuffled.slice(0, 5)),
    new ActionRowBuilder().addComponents(...shuffled.slice(5))
  ];
}

/**
 * Clears old bot messages in the verification channel
 */
async function clearOldMessages(channel) {
  const messages = await channel.messages.fetch({ limit: 50 });
  const botMessages = messages.filter(msg => msg.author.id === client.user.id);
  for (const msg of botMessages.values()) {
    await msg.delete().catch(() => { }); // Ignore errors (e.g., message already deleted)
  }
}

/**
 * Posts a new captcha embed with buttons to the verification channel
 */
async function postCaptchaEmbed() {
  const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);
  if (!channel) return;

  await clearOldMessages(channel);

  const { question, answer } = generateCaptcha();
  currentCaptcha = { question, answer };
  const nextRefreshTimestamp = Math.floor(Date.now() / 1000) + 60;

  const embed = new EmbedBuilder()
    .setColor('#ffaa00')
    .setTitle('👋 Welcome to SyntaxCafe!')
    .setDescription(`We're glad to have you here. Here's what you need to know:\n\n📜 **Rules**\n1. Be respectful\n2. Keep discussions dev-related\n3. No spam or self-promo\n\n🧠 **To verify you're human**, solve the question below:\n**What is \`${question}\`?**\nClick the correct button to unlock the community.\n\n🔄 **New challenge in**: <t:${nextRefreshTimestamp}:R>`)
    .setFooter({ text: 'SyntaxCafe Verification' });

  const buttonRows = createButtonRow(answer);
  currentMessage = await channel.send({ embeds: [embed], components: buttonRows });

  startCaptchaCollector(currentMessage);
  scheduleCaptchaRotation();
}

/**
 * Schedules the captcha to rotate (refresh) every 60 seconds
 */
function scheduleCaptchaRotation() {
  if (rotationInterval) clearInterval(rotationInterval);
  rotationInterval = setInterval(async () => {
    if (!currentMessage) return;

    const { question, answer } = generateCaptcha();
    currentCaptcha = { question, answer };
    const nextRefreshTimestamp = Math.floor(Date.now() / 1000) + 60;

    const updatedEmbed = EmbedBuilder.from(currentMessage.embeds[0])
      .setDescription(`We're glad to have you here. Here's what you need to know:\n\n📜 **Rules**\n1. Be respectful\n2. Keep discussions dev-related\n3. No spam or self-promo\n\n🧠 **To verify you're human**, solve the question below:\n**What is \`${question}\`?**\nClick the correct button to unlock the community.\n\n🔄 **New challenge in**: <t:${nextRefreshTimestamp}:R>`);

    const newButtonRows = createButtonRow(answer);
    try {
      await currentMessage.edit({ embeds: [updatedEmbed], components: newButtonRows });
    } catch (err) {
      console.error('Failed to edit captcha embed:', err);
    }
  }, 60 * 1000);
}

/**
 * Starts a collector to handle button interactions for captcha verification
 */
function startCaptchaCollector(message) {
  const failureMap = new Map(); // Tracks wrong attempts per user
  const cooldownMap = new Map(); // Tracks cooldown between user attempts

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30 * 60 * 1000 // Collector runs for 30 minutes
  });

  collector.on('collect', async interaction => {
    if (!interaction.isButton()) return;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const now = Date.now();

    // Cooldown: Prevent spam clicking (3 sec cooldown)
    if (cooldownMap.has(interaction.user.id) && now - cooldownMap.get(interaction.user.id) < 3000) {
      return interaction.reply({ content: '⏳ Slow down a bit before trying again.', ephemeral: true });
    }
    cooldownMap.set(interaction.user.id, now);

    // Check if user is already verified
    if (member.roles.cache.has(VERIFY_ROLE_ID)) {
      return interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
    }

    // Handle correct captcha button click
    if (interaction.customId.startsWith('captcha_correct')) {
      await member.roles.add(VERIFY_ROLE_ID).catch(console.error);
      await interaction.reply({ content: '✅ Verified! Welcome to the community.', ephemeral: true });

      const timeSinceJoin = getTimeSince(member.joinedAt);
      const logChannel = await client.channels.fetch(VERIFY_LOG_CHANNEL);
      if (logChannel) {
        logChannel.send(`✅ <@${interaction.user.id}> passed the captcha. Joined the server **${timeSinceJoin}** ago and took **${failureMap.get(interaction.user.id) || 0}** failed attempt(s).`);
      }
    } else { // Handle incorrect captcha button click
      const fails = failureMap.get(interaction.user.id) || 0;
      const newFails = fails + 1;
      failureMap.set(interaction.user.id, newFails);

      await interaction.reply({ content: '❌ That’s not correct, try again!', ephemeral: true });

      // Log if user fails 3+ times
      if (newFails >= 3) {
        const logChannel = await client.channels.fetch(VERIFY_LOG_CHANNEL);
        if (logChannel) {
          logChannel.send(`⚠️ <@${interaction.user.id}> failed the captcha **${newFails} times**.\n> Question: \`${currentCaptcha?.question || 'unknown'}\``);
        }
      }
    }
  });
}

/**
 * Helper to get human-readable time since a user joined the server
 */
function getTimeSince(joinDate) {
  const now = new Date();
  let delta = Math.floor((now - joinDate) / 1000);
  const months = Math.floor(delta / (30 * 24 * 3600)); delta -= months * 30 * 24 * 3600;
  const days = Math.floor(delta / (24 * 3600)); delta -= days * 24 * 3600;
  const hours = Math.floor(delta / 3600); delta -= hours * 3600;
  const minutes = Math.floor(delta / 60); delta -= minutes * 60;
  const seconds = delta;
  return `${months ? `${months} month${months > 1 ? 's' : ''}, ` : ''}${days ? `${days} day${days > 1 ? 's' : ''}, ` : ''}${hours ? `${hours} hour${hours > 1 ? 's' : ''}, ` : ''}${minutes ? `${minutes} minute${minutes > 1 ? 's' : ''}, ` : ''}${seconds} second${seconds !== 1 ? 's' : ''}`;
}

// Bot ready event
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('syntaxcafe.app', {
    type: ActivityType.Streaming,
    url: 'https://syntaxcafe.app'
  });

  await postCaptchaEmbed();
  setInterval(postCaptchaEmbed, 30 * 60 * 1000); // Repost captcha every 30 mins

  // Register slash commands
  const commands = [
    // /status command
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check the status of SyntaxCafe site'),

    // /socials command
    new SlashCommandBuilder()
      .setName('socials')
      .setDescription('Get all official SyntaxCafe social links'),

    // /ban command for moderators
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a user')
      .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    // /kick command for moderators
    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a user')
      .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    // /timeout command for moderators
    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout a user for x minutes')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(opt => opt.setName('duration').setDescription('Minutes').setRequired(false))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  ];

  // Deploy commands to all guilds
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  const guilds = client.guilds.cache.map(g => g.id);
  for (const guildId of guilds) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
      body: commands.map(cmd => cmd.toJSON())
    });
  }
});

// Handle slash command execution
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild } = interaction;

  // Handle /status command
  if (commandName === 'status') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const response = await fetch('https://syntaxcafe.app', { method: 'GET', timeout: 5000 });
      if (!response.ok) throw new Error(`Status: ${response.status}`);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📡 SyntaxCafe Status')
            .setColor('Green')
            .setDescription('🟢 SyntaxCafe is online and responsive!\n\n[Visit the website](https://syntaxcafe.app)')
            .setFooter({ text: 'Status check successful' })
        ]
      });
    } catch (err) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📡 SyntaxCafe Status')
            .setColor('Red')
            .setDescription(`🔴 SyntaxCafe might be **offline or unresponsive**.\n\nError: \`${err.message}\``)
            .setFooter({ text: 'Status check failed' })
        ]
      });
    }
  }

  // Handle /socials command
  if (commandName === 'socials') {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔗 SyntaxCafe Socials')
          .setColor('Blurple')
          .setDescription(`Follow us:\n🌐 [Website](https://syntaxcafe.app)\n📸 Instagram: [@syntax.cafe](https://instagram.com/)\n🐦 Twitter: [@syntaxcafe](https://twitter.com/)`)
          .setFooter({ text: 'Stay connected with SyntaxCafe' })
      ],
      ephemeral: true
    });
  }

  // Moderation commands (/ban, /kick, /timeout) — All check for MODERATION_ROLE_ID
  // Each of these blocks ensures only moderators can run these commands, logs the action, and DMs the user being moderated
  // ... (These parts are self-explanatory from the logic above)

  if (commandName === 'ban') {
    if (!member.roles.cache.has(MODERATION_ROLE_ID)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const target = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided.';
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

    try {
      await target.send(`🔨 You have been **banned** from **${guild.name}**.\n**Reason:** ${reason}`);
    } catch { }

    await targetMember.ban({ reason });
    await interaction.reply(`🔨 Banned ${target.tag} for: **${reason}**`);

    const logChannel = await client.channels.fetch(MODERATION_LOG_CHANNEL).catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('🔨 Member Banned')
        .setColor('Red')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'User', value: `<@${target.id}>`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] });
    }
  }


  if (commandName === 'kick') {
    if (!member.roles.cache.has(MODERATION_ROLE_ID)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const target = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided.';
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

    try {
      await target.send(`👢 You have been **kicked** from **${guild.name}**.\n**Reason:** ${reason}`);
    } catch { }

    await targetMember.kick(reason);
    await interaction.reply(`👢 Kicked ${target.tag} for: **${reason}**`);

    const logChannel = await client.channels.fetch(MODERATION_LOG_CHANNEL).catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('👢 Member Kicked')
        .setColor('Orange')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'User', value: `<@${target.id}>`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] });
    }
  }


  if (commandName === 'timeout') {
    if (!member.roles.cache.has(MODERATION_ROLE_ID)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const target = options.getUser('user');
    const duration = options.getInteger('duration') || 5;
    const reason = options.getString('reason') || 'No reason provided.';
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember || !targetMember.moderatable) {
      return interaction.reply({ content: '❌ Unable to timeout this user.', ephemeral: true });
    }

    try {
      await target.send(`⏳ You have been **timed out** in **${guild.name}** for **${duration} minute(s)**.\n**Reason:** ${reason}`);
    } catch { }

    const ms = duration * 60 * 1000;
    await targetMember.timeout(ms, reason);
    await interaction.reply(`⏳ Timed out ${target.tag} for **${duration} minute(s)**. Reason: **${reason}**`);

    const logChannel = await client.channels.fetch(MODERATION_LOG_CHANNEL).catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('⏳ Member Timed Out')
        .setColor('Blue')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'User', value: `<@${target.id}>`, inline: true },
          { name: 'Duration', value: `${duration} minute(s)`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] });
    }
  }
});

// Login to Discord
client.login(process.env.BOT_TOKEN);