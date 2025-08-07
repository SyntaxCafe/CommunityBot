require('dotenv').config();

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
  ChannelType,
  AttachmentBuilder,
  Routes
} = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
});

// Configs
const VERIFY_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID;
const VERIFY_ROLE_ID = process.env.ROLE_COMMUNITY_MEMBER;
const VERIFY_LOG_CHANNEL = process.env.VERIFICATION_LOG;
const MODERATION_ROLE_ID = process.env.ROLE_COMMUNITY_STAFF;
const MODERATION_LOG_CHANNEL = process.env.MODERATION_LOG;
const GENERAL_CHANNEL_ID = process.env.GENERAL_CHANNEL_ID; // Add this to your .env file
const TICKET_CHANNEL_ID = process.env.TICKET_CHANNEL_ID; // Channel where ticket embed is posted
const STAFF_ROLES = process.env.STAFF_ROLES.split(","); // Comma-separated role IDs
const ARCHIVE_CATEGORY_ID = process.env.ARCHIVE_CATEGORY_ID;
const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID;
const HELP_CATEGORY_ID = process.env.HELP_CATEGORY_ID;
const CONVERSATION_STARTERS = [
  {
    text: "What projects are you all working on right now? Share your progress!",
    image:
      "https://cdn.discordapp.com/attachments/1402438553493049456/1402749872460927037/Discord_Convo_Starter.png?ex=68950c1f&is=6893ba9f&hm=6a2312b2c80bd420314ba343781e3c8fc284c154ade9c3e384d6c2d29ef87350&", // Replace with actual image URL
  },
  {
    text: "What's your favorite tech stack and why?",
    image:
      "https://cdn.discordapp.com/attachments/1402438553493049456/1402749872460927037/Discord_Convo_Starter.png?ex=68950c1f&is=6893ba9f&hm=6a2312b2c80bd420314ba343781e3c8fc284c154ade9c3e384d6c2d29ef87350&",
  },
  {
    text: "What's the most challenging bug you've ever fixed?",
    image:
      "https://cdn.discordapp.com/attachments/1402438553493049456/1402749872460927037/Discord_Convo_Starter.png?ex=68950c1f&is=6893ba9f&hm=6a2312b2c80bd420314ba343781e3c8fc284c154ade9c3e384d6c2d29ef87350&",
  },
  {
    text: "What programming language are you learning currently?",
    image:
      "https://cdn.discordapp.com/attachments/1402438553493049456/1402749872460927037/Discord_Convo_Starter.png?ex=68950c1f&is=6893ba9f&hm=6a2312b2c80bd420314ba343781e3c8fc284c154ade9c3e384d6c2d29ef87350&",
  },
  {
    text: "What's your favorite developer tool or extension?",
    image:
      "https://cdn.discordapp.com/attachments/1402438553493049456/1402749872460927037/Discord_Convo_Starter.png?ex=68950c1f&is=6893ba9f&hm=6a2312b2c80bd420314ba343781e3c8fc284c154ade9c3e384d6c2d29ef87350&",
  },
  {
    text: "What's your best tip for new developers?",
    image:
      "https://cdn.discordapp.com/attachments/1402438553493049456/1402749872460927037/Discord_Convo_Starter.png?ex=68950c1f&is=6893ba9f&hm=6a2312b2c80bd420314ba343781e3c8fc284c154ade9c3e384d6c2d29ef87350&",
  },
  {
    text: "What's the most interesting tech trend you're following?",
    image:
      "https://cdn.discordapp.com/attachments/1402438553493049456/1402749872460927037/Discord_Convo_Starter.png?ex=68950c1f&is=6893ba9f&hm=6a2312b2c80bd420314ba343781e3c8fc284c154ade9c3e384d6c2d29ef87350&",
  },
];

let currentMessage = null;
let currentCaptcha = null;
let rotationInterval = null;
let activityIndex = 0;

function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const result = num1 + num2;
  if (result > 9) return generateCaptcha();
  return { question: `${num1} + ${num2}`, answer: result };
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function createButtonRow(answer) {
  const buttons = [];
  for (let i = 1; i <= 9; i++) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`captcha_${i === answer ? 'correct' : 'wrong'}_${i}`)
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

async function clearOldMessages(channel) {
  const messages = await channel.messages.fetch({ limit: 50 });
  const botMessages = messages.filter(msg => msg.author.id === client.user.id);
  for (const msg of botMessages.values()) {
    await msg.delete().catch(() => {});
  }
}

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

async function clearPreviousConversationStarters(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 });
    const botMessages = messages.filter(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title === "💬 Community Question"
    );

    for (const msg of botMessages.values()) {
      await msg.delete().catch(() => {}); // Silent fail if message is already deleted
    }
  } catch (error) {
    console.error("Error clearing previous conversation starters:", error);
  }
}

async function postConversationStarter() {
  try {
    const channel = await client.channels.fetch(GENERAL_CHANNEL_ID);
    if (!channel) return;

    // First delete any previous conversation starters
    await clearPreviousConversationStarters(channel);

    const randomQuestion =
      CONVERSATION_STARTERS[
        Math.floor(Math.random() * CONVERSATION_STARTERS.length)
      ];

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("💬 Community Question")
      .setDescription(randomQuestion.text)
      .setImage(randomQuestion.image)
      .setFooter({ text: "Let's keep the conversation going!" });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error posting conversation starter:", error);
  }
}

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

function startCaptchaCollector(message) {
  const failureMap = new Map();
  const cooldownMap = new Map();

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30 * 60 * 1000
  });

  collector.on('collect', async interaction => {
    if (!interaction.isButton()) return;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const now = Date.now();

    if (cooldownMap.has(interaction.user.id) && now - cooldownMap.get(interaction.user.id) < 3000) {
      return interaction.reply({ content: '⏳ Slow down a bit before trying again.', ephemeral: true });
    }
    cooldownMap.set(interaction.user.id, now);

    if (member.roles.cache.has(VERIFY_ROLE_ID)) {
      return interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
    }

    if (interaction.customId.startsWith('captcha_correct')) {
      await member.roles.add(VERIFY_ROLE_ID).catch(console.error);
      await interaction.reply({ content: '✅ Verified! Welcome to the community.', ephemeral: true });

      const timeSinceJoin = getTimeSince(member.joinedAt);
      const logChannel = await client.channels.fetch(VERIFY_LOG_CHANNEL);
      if (logChannel) {
        logChannel.send(`✅ <@${interaction.user.id}> passed the captcha. Joined the server **${timeSinceJoin}** ago and took **${failureMap.get(interaction.user.id) || 0}** failed attempt(s).`);
      }
    } else {
      const fails = failureMap.get(interaction.user.id) || 0;
      const newFails = fails + 1;
      failureMap.set(interaction.user.id, newFails);

      await interaction.reply({ content: '❌ That’s not correct, try again!', ephemeral: true });

      if (newFails >= 3) {
        const logChannel = await client.channels.fetch(VERIFY_LOG_CHANNEL);
        if (logChannel) {
          logChannel.send(`⚠️ <@${interaction.user.id}> failed the captcha **${newFails} times**.\n> Question: \`${currentCaptcha?.question || 'unknown'}\``);
        }
      }
    }
  });
}

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


client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch();
  }
  const activities = [
    { type: 1, text: "syntaxcafe.app" }, // Streaming
    { type: 3, text: () => `over ${client.users.cache.size} users` }, // Watching
    { type: 0, text: () => `with ${client.guilds.cache.size} servers` }, // Playing
  ];

  function updatePresence(client) {
    const activity = activities[activityIndex];
    const text =
      typeof activity.text === "function" ? activity.text() : activity.text;

    client.user.setActivity(text, { type: activity.type });

    activityIndex = (activityIndex + 1) % activities.length;
  }
  setInterval(() => updatePresence(client), 15000);
  await postConversationStarter(); // Post immediately on startup
  setInterval(postConversationStarter, 60 * 60 * 1000); // Then every hour

  await postCaptchaEmbed();
  setInterval(postCaptchaEmbed, 30 * 60 * 1000);
  async function initializeTicketSystem() {
    const channel = await client.channels.fetch(TICKET_CHANNEL_ID);
    if (!channel) return;

    // Clear existing bot messages
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMessages = messages.filter(
      (msg) => msg.author.id === client.user.id
    );
    await Promise.all(botMessages.map((msg) => msg.delete().catch(() => {})));

    // Create ticket embed
    const embed = new EmbedBuilder()
      .setTitle("📩 Need Help?")
      .setDescription("Click one of the buttons below to create a ticket")
      .setColor("#5865F2")
      .addFields(
        {
          name: "🔹 Job Enquiry",
          value: "For job-related questions",
          inline: true,
        },
        {
          name: "🔹 Platform Enquiry",
          value: "Questions about our platform",
          inline: true,
        },
        { name: "🔹 Other", value: "All other questions", inline: true }
      );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_job")
        .setLabel("Job Enquiry")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("💼"),
      new ButtonBuilder()
        .setCustomId("ticket_platform")
        .setLabel("Platform Enquiry")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🖥️"),
      new ButtonBuilder()
        .setCustomId("ticket_other")
        .setLabel("Other")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❓")
    );

    await channel.send({ embeds: [embed], components: [buttons] });
  }

  // Add to your client.once('ready')
  await initializeTicketSystem();
  // Slash commands registration
  const commands = [
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Check the status of SyntaxCafe site"),

    new SlashCommandBuilder()
      .setName("socials")
      .setDescription("Get all official SyntaxCafe social links"),

    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a user")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to ban").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("Reason").setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a user")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to kick").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("Reason").setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Timeout a user for x minutes")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User").setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName("duration").setDescription("Minutes").setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName("reason").setDescription("Reason").setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  const guilds = client.guilds.cache.map((g) => g.id);
  for (const guildId of guilds) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
      body: commands.map((cmd) => cmd.toJSON()),
    });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const { commandName, options, member, guild } = interaction;
  // Ticket creation
  if (interaction.customId.startsWith("ticket_")) {
    const ticketType = interaction.customId.split("_")[1];
    const member = interaction.member;

    // Check if user already has an open ticket
    const existingChannel = interaction.guild.channels.cache.find(
      (c) => c.name === `ticket-${member.user.username.toLowerCase()}`
    );

    if (existingChannel) {
      return interaction.reply({
        content: `❌ You already have an open ticket: ${existingChannel}`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Create private channel
      const channel = await interaction.guild.channels.create({
        name: `ticket-${member.user.username}`,
        type: ChannelType.GuildText,
        parent: HELP_CATEGORY_ID,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
          ...STAFF_ROLES.map((roleId) => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.ManageChannels,
            ],
          })),
        ],
      });
      const FACTS_BY_TYPE = {
        job: [
          "The average developer changes jobs every 2-3 years.",
          "85% of jobs are filled through networking.",
          "GitHub profiles are becoming as important as resumes for developers.",
          "Taking breaks every 90 minutes improves productivity by 20%.",
          "The most productive developers average 4-5 hours of coding per day.",
          "Rubber duck debugging is a real troubleshooting technique!",
        ],
        platform: [
          "Our platform processes over 1,000 requests per second at peak times.",
          "We use React and Node.js for our frontend and backend.",
          "Our database contains over 10,000 active user accounts.",
          "React was originally created by Jordan Walke at Facebook in 2011.",
          "The average website uses 1.6MB of JavaScript code.",
          "TypeScript was first released by Microsoft in 2012.",
          "The Node.js runtime uses Google's V8 JavaScript engine.",
          "Git was created by Linus Torvalds in 2005 for Linux kernel development.",
          "The first version of HTML had only 18 tags.",
          "CSS stands for Cascading Style Sheets and was first proposed in 1994.",
          "The term 'API' stands for Application Programming Interface.",
          "The first web browser was called WorldWideWeb and was created in 1990.",
          "npm (Node Package Manager) is the world's largest software registry.",
        ],
        other: [
          "JavaScript was created in just 10 days in 1995!",
          "The first computer bug was an actual moth stuck in a Harvard Mark II computer in 1947.",
          "Python was named after Monty Python, not the snake.",
          "The first website (info.cern.ch) went live in 1991 and is still online!",
          "There are over 700 programming languages in existence today.",
          "The original Apple-1 computer sold for $666.66 in 1976.",
          "The term 'debugging' comes from removing that actual moth from the computer.",
          "The first computer programmer was Ada Lovelace in the 1840s.",
          "The QWERTY keyboard layout was designed to slow typists down to prevent jamming on old typewriters.",
          "The world's first stored-program computer was the Manchester Baby, which ran its first program in 1948.",
        ],
      };
      // Send ticket embed
      const facts = FACTS_BY_TYPE[ticketType] || FUN_FACTS;
      const randomFact = facts[Math.floor(Math.random() * facts.length)];
      const embed = new EmbedBuilder()
        .setTitle(
          `Ticket: ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)}`
        )
        .setDescription(
          `**User:** ${member.user.tag}\n**Type:** ${ticketType}\n\n**💡 DID YOU KNOW?** ${randomFact}\n\nPlease describe your issue in detail. A member of our support team will be with you shortly.`
        )
        .setColor("#5865F2")
        .setThumbnail(member.user.displayAvatarURL());

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket-claim")
          .setLabel("Claim")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🙋"),
        new ButtonBuilder()
          .setCustomId("ticket-close")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒"),
        new ButtonBuilder()
          .setCustomId("ticket-transcript")
          .setLabel("Transcript")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📄")
      );

      const ticketMessage = await channel.send({
        content: `${member} ${STAFF_ROLES.map((r) => `<@&${r}>`).join(" ")}`,
        embeds: [embed],
        components: [buttons],
      });

      await interaction.editReply({
        content: `✅ We've recieved your request, please continue in ${channel}.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Ticket creation error:", error);
      await interaction.editReply({
        content: "❌ Failed to contact support. Please try again later.",
        ephemeral: true,
      });
    }
  }

  // Ticket management
  if (
    interaction.customId.startsWith("ticket-")
  ) {
    const action = interaction.customId.split("-")[1];
    const member = interaction.member;
    const isStaff = member.roles.cache.some((role) =>
      STAFF_ROLES.includes(role.id)
    );

    if (!isStaff) {
      return interaction.reply({
        content: "❌ Only staff can manage tickets.",
        ephemeral: true,
      });
    }

    switch (action) {
      case "claim": {
        const claimedEmbed = new EmbedBuilder()
          .setDescription(`🎫 Your support ticket will be handled by our amazing team memeber **${member}**!`)
          .setColor("#57F287");

        await interaction.reply({ embeds: [claimedEmbed] });
        await interaction.message.edit({
          components: interaction.message.components.map((row) =>
            ActionRowBuilder.from(row).setComponents(
              row.components.map((btn) => {
                if (btn.customId === "ticket-claim") {
                  return ButtonBuilder.from(btn)
                    .setDisabled(true)
                    .setLabel("Claimed")
                    .setStyle(ButtonStyle.Secondary);
                }
                return ButtonBuilder.from(btn);
              })
            )
          ),
        });
        break;
      }

      case "close": {
        await interaction.deferReply();

        // Create transcript
        const messages = await interaction.channel.messages.fetch({
          limit: 100,
        });
        const transcript = messages
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map(
            (msg) =>
              `[${msg.author.tag} - ${msg.createdAt.toLocaleString()}]: ${
                msg.content
              }`
          )
          .join("\n");

        const transcriptChannel = await client.channels.fetch(
          TRANSCRIPT_CHANNEL_ID
        );
        const transcriptFile = new AttachmentBuilder(
          Buffer.from(transcript, "utf-8"),
          {
            name: `${interaction.channel.name}.txt`,
          }
        );

        // Move to archive
        await interaction.channel.setParent(ARCHIVE_CATEGORY_ID);
        await interaction.channel.permissionOverwrites.set([
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          ...STAFF_ROLES.map((roleId) => ({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel],
          })),
        ]);

        await interaction.editReply({
          content: "✅ Ticket closed and archived.",
          files: [transcriptFile],
        });

        await transcriptChannel.send({
          content: `📝 Transcript for ${interaction.channel.name}`,
          files: [transcriptFile],
        });

        // Disable all buttons
        await interaction.message.edit({
          components: interaction.message.components.map((row) =>
            ActionRowBuilder.from(row).setComponents(
              row.components.map((btn) =>
                ButtonBuilder.from(btn).setDisabled(true)
              )
            )
          ),
        });

        // Rename channel
        await interaction.channel.setName(
          `closed-${interaction.channel.name.replace("ticket-", "")}`
        );
        break;
      }

      case "transcript": {
        await interaction.deferReply({ ephemeral: true });

        const messages = await interaction.channel.messages.fetch({
          limit: 100,
        });
        const transcript = messages
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map(
            (msg) =>
              `[${msg.author.tag} - ${msg.createdAt.toLocaleString()}]: ${
                msg.content
              }`
          )
          .join("\n");

        const transcriptFile = new AttachmentBuilder(
          Buffer.from(transcript, "utf-8"),
          {
            name: `transcript-${interaction.channel.name}.txt`,
          }
        );

        await interaction.editReply({
          content: "Here is the transcript:",
          files: [transcriptFile],
          ephemeral: true,
        });
        break;
      }
    }
  }
  if (commandName === "status") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const response = await fetch("https://syntaxcafe.app", {
        method: "GET",
        timeout: 5000,
      });
      if (!response.ok) throw new Error(`Status: ${response.status}`);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📡 SyntaxCafe Status")
            .setColor("Green")
            .setDescription(
              "🟢 SyntaxCafe is online and responsive!\n\n[Visit the website](https://syntaxcafe.app)"
            )
            .setFooter({ text: "Status check successful" }),
        ],
      });
    } catch (err) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📡 SyntaxCafe Status")
            .setColor("Red")
            .setDescription(
              `🔴 SyntaxCafe might be **offline or unresponsive**.\n\nError: \`${err.message}\``
            )
            .setFooter({ text: "Status check failed" }),
        ],
      });
    }
  }

  if (commandName === "socials") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔗 SyntaxCafe Socials")
          .setColor("Blurple")
          .setDescription(
            `Follow us and stay updated:\n\n🌐 Website: [syntaxcafe.app](https://syntaxcafe.app)\n📸 Instagram: [@syntax.cafe](https://instagram.com/)\n🐦 Twitter: [@syntaxcafe](https://twitter.com/)`
          )
          .setFooter({ text: "Stay connected with SyntaxCafe" }),
      ],
      ephemeral: true,
    });
  }

  if (commandName === "ban") {
    if (!member.roles.cache.has(MODERATION_ROLE_ID)) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const target = options.getUser("user");
    const reason = options.getString("reason") || "No reason provided.";
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember)
      return interaction.reply({
        content: "❌ User not found.",
        ephemeral: true,
      });

    try {
      await target.send(
        `🔨 You have been **banned** from **${guild.name}**.\n**Reason:** ${reason}`
      );
    } catch {}

    await targetMember.ban({ reason });
    await interaction.reply(`🔨 Banned ${target.tag} for: **${reason}**`);

    const logChannel = await client.channels
      .fetch(MODERATION_LOG_CHANNEL)
      .catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle("🔨 Member Banned")
        .setColor("Red")
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          {
            name: "Moderator",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: "User", value: `<@${target.id}>`, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] });
    }
  }

  if (commandName === "kick") {
    if (!member.roles.cache.has(MODERATION_ROLE_ID)) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const target = options.getUser("user");
    const reason = options.getString("reason") || "No reason provided.";
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember)
      return interaction.reply({
        content: "❌ User not found.",
        ephemeral: true,
      });

    try {
      await target.send(
        `👢 You have been **kicked** from **${guild.name}**.\n**Reason:** ${reason}`
      );
    } catch {}

    await targetMember.kick(reason);
    await interaction.reply(`👢 Kicked ${target.tag} for: **${reason}**`);

    const logChannel = await client.channels
      .fetch(MODERATION_LOG_CHANNEL)
      .catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle("👢 Member Kicked")
        .setColor("Orange")
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          {
            name: "Moderator",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: "User", value: `<@${target.id}>`, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] });
    }
  }

  if (commandName === "timeout") {
    if (!member.roles.cache.has(MODERATION_ROLE_ID)) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    const target = options.getUser("user");
    const duration = options.getInteger("duration") || 5;
    const reason = options.getString("reason") || "No reason provided.";
    const targetMember = await guild.members.fetch(target.id).catch(() => null);

    if (!targetMember || !targetMember.moderatable) {
      return interaction.reply({
        content: "❌ Unable to timeout this user.",
        ephemeral: true,
      });
    }

    try {
      await target.send(
        `⏳ You have been **timed out** in **${guild.name}** for **${duration} minute(s)**.\n**Reason:** ${reason}`
      );
    } catch {}

    const ms = duration * 60 * 1000;
    await targetMember.timeout(ms, reason);
    await interaction.reply(
      `⏳ Timed out ${target.tag} for **${duration} minute(s)**. Reason: **${reason}**`
    );

    const logChannel = await client.channels
      .fetch(MODERATION_LOG_CHANNEL)
      .catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle("⏳ Member Timed Out")
        .setColor("Blue")
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          {
            name: "Moderator",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: "User", value: `<@${target.id}>`, inline: true },
          { name: "Duration", value: `${duration} minute(s)`, inline: true },
          { name: "Reason", value: reason }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] });
    }
  }
});


client.login(process.env.BOT_TOKEN);
