/**
 * TypeScript port of the ft_irc server's command logic
 * (SaadM33/Internet-Relay-Chat, C++98). File-by-file mirror:
 *   Server.cpp / ProcessCmd.cpp / Parsing.cpp / Channel.cpp / utils.cpp / cmds/*.cpp
 *
 * Only the network is simulated: socket()/bind()/listen()/accept()/recv()/send()/close()
 * are replaced by in-page calls, and every call is reported through `trace` so the UI can draw
 * the poll() loop. Reply strings are built exactly as the C++ builds them.
 */
import { ARTS } from "./artbot";

// ---- includes/utils.hpp ----
export const RPL = {
  RPL_WELCOME: "001",
  RPL_CHANNELMODEIS: "324",
  RPL_NOTOPIC: "331",
  ERR_NOSUCHNICK: "401",
  ERR_NOSUCHCHANNEL: "403",
  ERR_NOORIGIN: "409",
  ERR_NORECIPIENT: "411",
  ERR_NOTEXTTOSEND: "412",
  ERR_UNKNOWNCOMMAND: "421",
  ERR_NONICKNAMEGIVEN: "431",
  ERR_ERRONEUSNICKNAME: "432",
  ERR_NICKNAMEINUSE: "433",
  ERR_USERNOTINCHANNEL: "441",
  ERR_NOTONCHANNEL: "442",
  ERR_USERONCHANNEL: "443",
  ERR_NOTREGISTERED: "451",
  ERR_NEEDMOREPARAMS: "461",
  ERR_ALREADYREGISTERED: "462",
  ERR_PASSWDMISMATCH: "464",
  ERR_CHANNELISFULL: "471",
  ERR_INVITEONLYCHAN: "473",
  ERR_BADCHANNELKEY: "475",
  ERR_CHANOPRIVSNEEDED: "482",
} as const;

// Server::instantiateReplies(). Codes missing here (e.g. 324) map to "" like std::map::operator[].
const replyMap: Record<string, string> = {
  "001": "Welcome to the IRC server Mortal!",
  "401": "No such nick/channel",
  "421": "Command beyond comprehension",
  "431": "No nickname given",
  "432": "Erroneous nickname",
  "433": "Nickname is already in use",
  "451": "You have not registered",
  "461": "Not enough parameters",
  "462": "You may not reregister",
  "464": "Password incorrect",
  "471": "Channel is full",
  "473": "Cannot join channel (+i)",
  "475": "Cannot join channel (+k)",
  "482": "You're not channel operator",
  "412": "No text to send",
  "411": "No recipient given (PRIVMSG)",
  "403": "No such channel",
  "409": "No origin specified",
  "331": "No topic is set",
  "442": "You're not on that channel",
  "404": "Cannot send to channel",
  "441": "They're not on that channel",
  "443": "is already on channel",
};

export interface Message { command: string; params: string[]; trailing: string }

export type Trace =
  | { k: "poll"; fd: number; revents: "POLLIN" }
  | { k: "accept"; fd: number }
  | { k: "recv"; fd: number; bytes: number; data: string }
  | { k: "cmd"; fd: number; line: string; handler: string }
  | { k: "buffer"; fd: number; pending: string }
  | { k: "send"; fd: number; data: string; from: number }
  | { k: "close"; fd: number; why: string };

// ---- Client.hpp ----
export class Client {
  nickName = "*";
  userName = "";
  realName = "";
  isRegistered = false;
  has_pass = false;
  has_nick = false;
  has_user = false;
  channels = new Map<string, Channel>();
  r_buffer = "";
  constructor(public fd: number, public ip: string) {}
  getPrefix() { return ":" + this.nickName + "!" + this.userName + "@" + this.ip; }
}

// std::map iterates in key order; JS Map in insertion order. Sort where the C++ iterates.
const byFd = <T>(m: Map<number, T>) => [...m.entries()].sort((a, b) => a[0] - b[0]);
const byName = <T>(m: Map<string, T>) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

/** std::getline(ss, item, ',') loop: empty fields kept, a final empty field is not produced. */
function getlineSplit(s: string, sep = ","): string[] {
  const parts = s.split(sep);
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}
const isspace = /[ \t\n\v\f\r]+/;
const isalnum = (c: string) => /^[A-Za-z0-9]$/.test(c);
const isdigit = (c: string) => c >= "0" && c <= "9";

interface ModeBroadcast { modes: string; args: string; unknown: string }

// ---- Channel.cpp ----
export class Channel {
  topic = "";
  key = "";
  isInviteOnly = false;
  isKeySet = false;
  topicRestricted = false;
  membersLimit = -1;
  members = new Map<number, Client>();
  operators = new Map<number, Client>();
  inviteList: number[] = [];
  constructor(public name: string, private srv: Server) {}

  broadcast(client: Client, message: string, skipSender = false) {
    const prefix = client.getPrefix();
    for (const [fd] of byFd(this.members)) {
      if (skipSender && fd === client.fd) continue;
      this.srv.send(fd, prefix + " " + message, client.fd);
    }
  }
  operatorsBroadcast(client: Client, message: string) {
    const prefix = client.getPrefix();
    for (const [fd] of byFd(this.operators)) {
      if (fd === client.fd) continue;
      this.srv.send(fd, prefix + " " + message, client.fd);
    }
  }
  findInviteList(fd: number) { return this.inviteList.indexOf(fd); }

  addClient(client: Client) {
    if (this.members.size === 0) this.operators.set(client.fd, client);
    this.members.set(client.fd, client);
    client.channels.set(this.name, this);

    let message = "JOIN " + this.name + "\r\n";
    this.broadcast(client, message);

    if (this.topic !== "") {
      message = ":localhost 332 " + client.nickName + " " + this.name + " :" + this.topic + "\r\n";
      this.srv.send(client.fd, message);
    }
    message = ":localhost 353 " + client.nickName + " = " + this.name + " :";
    for (const [fd, c] of byFd(this.members)) {
      if (this.operators.has(fd)) message += "@" + c.nickName + " ";
      else message += c.nickName + " ";
    }
    message += "\r\n";
    this.srv.send(client.fd, message);
    message = ":localhost 366 " + client.nickName + " " + this.name + " :End of NAMES list\r\n";
    this.srv.send(client.fd, message);
  }
  removeClient(client: Client) {
    this.operators.delete(client.fd);
    this.members.delete(client.fd);
    client.channels.delete(this.name);
  }

  modeI(on: boolean, b: ModeBroadcast) {
    if (on && !this.isInviteOnly) { this.isInviteOnly = true; b.modes += "+i"; }
    else if (!on && this.isInviteOnly) { this.isInviteOnly = false; b.modes += "-i"; }
    return "";
  }
  modeK(on: boolean, newKey: string, b: ModeBroadcast) {
    if (newKey === "") return "";
    if (on) {
      this.key = newKey;
      if (!this.isKeySet) { this.isKeySet = true; b.modes += "+k"; b.args += " " + newKey; }
    } else {
      this.key = "";
      if (this.isKeySet) { this.isKeySet = false; b.modes += "-k"; b.args += " *"; }
    }
    return "";
  }
  modeL(on: boolean, newLim: string, idx: { v: number }, b: ModeBroadcast) {
    if (on) {
      if (isPositiveInt(newLim)) {
        // std::stringstream >> int (out-of-range saturates to INT_MAX in C++11 libstdc++)
        const n = parseInt(newLim, 10);
        this.membersLimit = n > 2147483647 ? 2147483647 : n;
        b.modes += "+l";
        b.args += " " + newLim;
      }
      idx.v++;
    } else if (this.membersLimit !== -1) {
      this.membersLimit = -1;
      b.modes += "-l";
    }
    return "";
  }
  modeO(on: boolean, targetNick: string, b: ModeBroadcast) {
    if (targetNick === "") return "";
    const targetFd = getFdFromNick(this.members, targetNick);
    if (!this.members.has(targetFd)) return RPL.ERR_USERNOTINCHANNEL;
    if (on) {
      if (this.operators.has(targetFd)) return "";
      this.operators.set(targetFd, this.members.get(targetFd)!);
      b.modes += "+o"; b.args += " " + targetNick;
    } else {
      if (!this.operators.has(targetFd)) return "";
      this.operators.delete(targetFd);
      b.modes += "-o"; b.args += " " + targetNick;
    }
    return "";
  }
  modeT(on: boolean, b: ModeBroadcast) {
    if (on && !this.topicRestricted) { this.topicRestricted = true; b.modes += "+t"; }
    else if (!on && this.topicRestricted) { this.topicRestricted = false; b.modes += "-t"; }
    return "";
  }
}

function isPositiveInt(str: string) {
  let i = 0;
  if (str === "") return false;
  if (str[i] === "+") i++;
  for (; i < str.length; i++) if (!isdigit(str[i])) return false;
  return true;
}

// ---- utils.cpp ----
function isValidNick(str: string) {
  if (str[0] === "#" || str[0] === "@") return false;
  for (const c of str) {
    if (!isalnum(c) && !"-_[]\\`^{|}".includes(c)) return false;
  }
  return true;
}
function getFdFromNick(clients: Map<number, Client>, str: string) {
  for (const [fd, c] of byFd(clients)) if (c.nickName === str) return fd;
  return -1;
}

// ---- Parsing.cpp ----
export function splitMessage(unprocessed: string): Message {
  const msg: Message = { command: "", params: [], trailing: "" };
  const trailIndex = unprocessed.indexOf(" :");
  let trailing = "";
  if (trailIndex !== -1) {
    trailing = unprocessed.substring(trailIndex + 2);
    unprocessed = unprocessed.substring(0, trailIndex);
  }
  const words = unprocessed.split(isspace).filter((w) => w !== "");
  msg.command = (words.shift() ?? "").replace(/[a-z]/g, (c) => c.toUpperCase());
  msg.params = words;
  if (trailing !== "") msg.trailing = trailing;
  return msg;
}

/** cleanUpModes() from Mode.cpp, including its index-skipping after erase. */
function cleanUpModes(modes: string) {
  if (modes === "") return modes;
  let sw: boolean;
  if (modes[0] === "+") sw = false;
  else if (modes[0] === "-") sw = true;
  else return modes;
  const m = modes.split("");
  for (let i = 0; i < m.length; i++) {
    if ((sw && m[i] === "+") || (!sw && m[i] === "-")) m.splice(i, 1);
    else if (sw && m[i] === "-") sw = false;
    else if (!sw && m[i] === "+") sw = true;
  }
  return m.join("");
}

const HANDLERS: Record<string, string> = {
  CAP: "execCap", PASS: "execPass", NICK: "execNick", USER: "execUser", JOIN: "execJoin",
  PART: "execPart", TOPIC: "execTopic", INVITE: "execInvite", KICK: "execKick", MODE: "execMode",
  PRIVMSG: "execPrivmsg", PING: "execPing", QUIT: "execQuit",
};
export const COMMANDS = Object.keys(HANDLERS);

// ---- Server.cpp ----
export class Server {
  readonly core_fd = 3;
  poll_fds: number[] = [];
  clients = new Map<number, Client>();
  channels = new Map<string, Channel>();
  private current = -1; // fd being processed, for trace attribution

  constructor(public port: number, public passwd: string, private trace: (t: Trace) => void) {
    this.poll_fds.push(this.core_fd); // ignite(): poll_fds.push_back({core_fd, POLLIN, 0})
  }

  // --- simulated socket layer ---
  send(fd: number, data: string, from = -1) {
    if (!this.clients.has(fd)) return; // send() on a closed fd fails
    this.trace({ k: "send", fd, data, from: from === -1 ? this.current : from });
  }
  private sendReply(fd: number, code: string, middle = "") {
    let reply = ":localhost " + code + " " + this.clients.get(fd)!.nickName;
    if (middle !== "") reply += " " + middle;
    reply += " :" + (replyMap[code] ?? "") + "\r\n";
    this.send(fd, reply);
  }

  /** A client calls connect(): poll() wakes on the listening socket, acceptClient() runs. */
  connect(ip = "127.0.0.1"): number {
    this.trace({ k: "poll", fd: this.core_fd, revents: "POLLIN" });
    let fd = 4; // accept() returns the lowest free descriptor
    while (this.clients.has(fd)) fd++;
    this.clients.set(fd, new Client(fd, ip));
    this.poll_fds.push(fd);
    this.trace({ k: "accept", fd });
    return fd;
  }

  /** Bytes arrive on fd: poll() reports POLLIN, processClient() recv()s in 1024-byte reads. */
  write(fd: number, data: string) {
    for (let off = 0; off < data.length; off += 1024) {
      if (!this.clients.has(fd)) return;
      const chunk = data.slice(off, off + 1024);
      this.trace({ k: "poll", fd, revents: "POLLIN" });
      this.trace({ k: "recv", fd, bytes: new TextEncoder().encode(chunk).length, data: chunk });
      this.clients.get(fd)!.r_buffer += chunk;
      this.handleInput(fd);
    }
  }

  /** Peer closed its end: poll() reports POLLIN, recv() returns 0, disconnectClient(). */
  hangup(fd: number) {
    if (!this.clients.has(fd)) return;
    this.trace({ k: "poll", fd, revents: "POLLIN" });
    this.trace({ k: "recv", fd, bytes: 0, data: "" });
    this.disconnectClient(fd, "recv() returned 0");
  }

  private registerClient(fd: number) {
    const c = this.clients.get(fd)!;
    if (c.has_nick && c.has_user && c.has_pass) {
      c.isRegistered = true;
      this.sendReply(fd, RPL.RPL_WELCOME);
    }
  }

  private disconnectClient(fd: number, why: string) {
    const rm: string[] = [];
    for (const [name, ch] of byName(this.channels)) {
      if (ch.members.has(fd)) ch.removeClient(this.clients.get(fd)!);
      if (ch.members.size === 0) rm.push(name);
    }
    for (const n of rm) this.channels.delete(n);
    this.poll_fds.splice(this.poll_fds.indexOf(fd), 1);
    this.clients.delete(fd);
    this.trace({ k: "close", fd, why });
  }

  private handleInput(fd: number) {
    const c = this.clients.get(fd)!;
    let lineIndex: number;
    while ((lineIndex = c.r_buffer.indexOf("\r\n")) !== -1) {
      const line = c.r_buffer.substring(0, lineIndex);
      c.r_buffer = c.r_buffer.substring(lineIndex + 2);
      const msg = splitMessage(line);
      if (msg.command === "") continue;
      this.processCmd(fd, msg, line);
      if (!this.poll_fds.includes(fd)) break;
    }
    if (this.clients.has(fd) && c.r_buffer !== "") this.trace({ k: "buffer", fd, pending: c.r_buffer });
  }

  // ---- ProcessCmd.cpp ----
  private processCmd(fd: number, msg: Message, line: string) {
    this.current = fd;
    const needsRegistration = !["PASS", "NICK", "USER", "CAP"].includes(msg.command);
    const handler = HANDLERS[msg.command];
    this.trace({ k: "cmd", fd, line, handler: needsRegistration && !this.clients.get(fd)!.isRegistered ? "processCmd → 451" : handler ?? "processCmd → 421" });
    if (needsRegistration && !this.clients.get(fd)!.isRegistered) {
      this.sendReply(fd, RPL.ERR_NOTREGISTERED, msg.command);
      return;
    }
    if (handler) (this as any)[handler](fd, msg);
    else this.sendReply(fd, RPL.ERR_UNKNOWNCOMMAND, msg.command);
  }

  // ---- cmds/Cap.cpp ----
  execCap(fd: number, msg: Message) {
    if (msg.params.length >= 1 && msg.params[0] === "LS") this.send(fd, ":localhost CAP * LS :\r\n");
  }

  // ---- cmds/Pass.cpp ----
  execPass(fd: number, msg: Message) {
    if (msg.params.length === 0) { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS); return; }
    if (this.clients.get(fd)!.isRegistered) { this.sendReply(fd, RPL.ERR_ALREADYREGISTERED); return; }
    if (msg.params[0] !== this.passwd) {
      this.sendReply(fd, RPL.ERR_PASSWDMISMATCH);
      this.disconnectClient(fd, "PASS mismatch");
      return;
    }
    this.clients.get(fd)!.has_pass = true;
  }

  // ---- cmds/Nick.cpp ----
  execNick(fd: number, msg: Message) {
    if (msg.params.length === 0) { this.sendReply(fd, RPL.ERR_NONICKNAMEGIVEN); return; }
    if (!isValidNick(msg.params[0])) { this.sendReply(fd, RPL.ERR_ERRONEUSNICKNAME); return; }
    if (getFdFromNick(this.clients, msg.params[0]) !== -1) { this.sendReply(fd, RPL.ERR_NICKNAMEINUSE, msg.params[0]); return; }
    const c = this.clients.get(fd)!;
    if (!c.isRegistered) {
      c.nickName = msg.params[0];
      c.has_nick = true;
      this.registerClient(fd);
    } else {
      const brdcst = c.getPrefix() + " NICK :" + msg.params[0] + "\r\n";
      const seen = new Set<number>([fd]);
      this.send(fd, brdcst);
      for (const [, ch] of byName(c.channels)) {
        for (const [mfd] of byFd(ch.members)) {
          if (!seen.has(mfd)) { seen.add(mfd); this.send(mfd, brdcst); }
        }
      }
      c.nickName = msg.params[0];
    }
  }

  // ---- cmds/User.cpp ----
  execUser(fd: number, msg: Message) {
    const c = this.clients.get(fd)!;
    if (c.isRegistered) { this.sendReply(fd, RPL.ERR_ALREADYREGISTERED); return; }
    if (msg.params.length < 3 || msg.trailing === "") { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS); return; }
    c.userName = msg.params[0];
    c.realName = msg.trailing;
    c.has_user = true;
    this.registerClient(fd);
  }

  // ---- cmds/Join.cpp ----
  execJoin(fd: number, msg: Message) {
    if (msg.params.length < 1) { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS, msg.command); return; }
    const ch_names = getlineSplit(msg.params[0]);
    const keys = msg.params.length > 1 ? getlineSplit(msg.params[1]) : [];
    for (let i = 0; i < ch_names.length; i++) {
      const name = ch_names[i];
      if (name === "" || name[0] !== "#") { this.sendReply(fd, RPL.ERR_NOSUCHCHANNEL, name); continue; }
      let ch = this.channels.get(name);
      if (!ch) {
        ch = new Channel(name, this);
        this.channels.set(name, ch);
      } else {
        if (ch.isInviteOnly && ch.findInviteList(fd) === -1) { this.sendReply(fd, RPL.ERR_INVITEONLYCHAN, name); continue; }
        if (ch.isKeySet && (i >= keys.length || keys[i] === "" || keys[i] !== ch.key)) { this.sendReply(fd, RPL.ERR_BADCHANNELKEY, name); continue; }
        if (ch.members.size === ch.membersLimit) { this.sendReply(fd, RPL.ERR_CHANNELISFULL, name); continue; }
      }
      ch.addClient(this.clients.get(fd)!);
      const inv = ch.findInviteList(fd);
      if (inv !== -1) ch.inviteList.splice(inv, 1);
    }
  }

  // ---- cmds/Part.cpp ----
  execPart(fd: number, msg: Message) {
    if (msg.params.length < 1) { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS); return; }
    const c = this.clients.get(fd)!;
    for (const item of getlineSplit(msg.params[0])) {
      if (item === "") continue;
      const ch = this.channels.get(item);
      if (!ch) { this.sendReply(fd, RPL.ERR_NOSUCHCHANNEL, item); continue; }
      if (!c.channels.has(item)) { this.sendReply(fd, RPL.ERR_NOTONCHANNEL, item); continue; }
      let partMsg = "PART " + item;
      if (msg.trailing !== "") partMsg += " :" + msg.trailing;
      partMsg += "\r\n";
      ch.broadcast(c, partMsg);
      ch.removeClient(c);
      if (ch.members.size === 0) this.channels.delete(item);
    }
  }

  // ---- cmds/Topic.cpp ----
  execTopic(fd: number, msg: Message) {
    if (msg.params.length < 1) { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS, msg.command); return; }
    const name_ch = msg.params[0];
    const c = this.clients.get(fd)!;
    const chan = this.channels.get(name_ch);
    if (!chan) { this.sendReply(fd, RPL.ERR_NOSUCHCHANNEL, name_ch); return; }
    if (!c.channels.has(name_ch)) { this.sendReply(fd, RPL.ERR_NOTONCHANNEL, name_ch); return; }
    if (msg.trailing === "") {
      if (chan.topic === "") this.sendReply(fd, RPL.RPL_NOTOPIC, name_ch);
      else this.send(fd, ":localhost 332 " + c.nickName + " " + name_ch + " :" + chan.topic + "\r\n");
    } else if (chan.topicRestricted && !chan.operators.has(fd)) {
      this.sendReply(fd, RPL.ERR_CHANOPRIVSNEEDED, name_ch);
    } else {
      chan.topic = msg.trailing;
      chan.broadcast(c, "TOPIC " + name_ch + " :" + msg.trailing + "\r\n");
    }
  }

  // ---- cmds/Invite.cpp ----
  execInvite(fd: number, msg: Message) {
    if (msg.params.length < 2) { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS, msg.command); return; }
    let targetFd = -1;
    for (const [cfd, c] of byFd(this.clients)) if (c.nickName === msg.params[0]) { targetFd = cfd; break; }
    if (targetFd === -1) { this.sendReply(fd, RPL.ERR_NOSUCHNICK, msg.params[0]); return; }
    const ch = this.channels.get(msg.params[1]);
    if (!ch) { this.sendReply(fd, RPL.ERR_NOSUCHCHANNEL, msg.params[1]); return; }
    if (!ch.members.has(fd)) { this.sendReply(fd, RPL.ERR_NOTONCHANNEL, msg.params[1]); return; }
    if (ch.isInviteOnly && !ch.operators.has(fd)) { this.sendReply(fd, RPL.ERR_CHANOPRIVSNEEDED, msg.params[1]); return; }
    if (ch.members.has(targetFd)) { this.sendReply(fd, RPL.ERR_USERONCHANNEL, msg.params[0] + " " + msg.params[1]); return; }
    const me = this.clients.get(fd)!;
    this.send(fd, ":localhost 341 " + me.nickName + " " + msg.params[0] + " " + ch.name + "\r\n");
    this.send(targetFd, me.getPrefix() + " " + msg.command + " " + msg.params[0] + " " + ch.name + "\r\n");
    ch.inviteList.push(targetFd);
  }

  // ---- cmds/Kick.cpp ----
  execKick(fd: number, msg: Message) {
    if (msg.params.length < 2) { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS, msg.command); return; }
    const name = msg.params[0];
    const ch = this.channels.get(name);
    if (!ch) { this.sendReply(fd, RPL.ERR_NOSUCHCHANNEL, name); return; }
    if (!ch.members.has(fd)) { this.sendReply(fd, RPL.ERR_NOTONCHANNEL, name); return; }
    if (!ch.operators.has(fd)) { this.sendReply(fd, RPL.ERR_CHANOPRIVSNEEDED, name); return; }
    const me = this.clients.get(fd)!;
    const comment = msg.trailing === "" ? me.nickName : msg.trailing;
    for (const targetNick of getlineSplit(msg.params[1])) {
      // (The C++ would dereference a deleted channel here if the kicker emptied it; we stop instead.)
      if (!this.channels.has(name)) break;
      let targetFd = -1;
      for (const [cfd, c] of byFd(this.clients)) if (c.nickName === targetNick) { targetFd = cfd; break; }
      if (targetFd === -1) { this.sendReply(fd, RPL.ERR_NOSUCHNICK, targetNick); continue; }
      if (!ch.members.has(targetFd)) { this.sendReply(fd, RPL.ERR_USERNOTINCHANNEL, targetNick + " " + name); continue; }
      ch.broadcast(me, "KICK " + name + " " + targetNick + " :" + comment + "\r\n");
      ch.removeClient(this.clients.get(targetFd)!);
      if (ch.members.size === 0) this.channels.delete(name);
    }
  }

  // ---- cmds/Mode.cpp ----
  execMode(fd: number, msg: Message) {
    if (msg.params.length < 1) { this.sendReply(fd, RPL.ERR_NEEDMOREPARAMS, msg.command); return; }
    const target = msg.params[0];
    const senderNick = this.clients.get(fd)!.nickName;
    if (target[0] !== "#") return; // user modes are silently ignored
    const ch = this.channels.get(target);
    if (!ch) { this.sendReply(fd, RPL.ERR_NOSUCHCHANNEL, target); return; }
    if (!ch.members.has(fd)) { this.sendReply(fd, RPL.ERR_NOTONCHANNEL, target); return; }

    if (msg.params.length === 1) {
      let reply = "";
      if (ch.isInviteOnly) reply += "i";
      if (ch.topicRestricted) reply += "t";
      if (ch.isKeySet) reply += "k";
      if (ch.membersLimit !== -1) reply += "l";
      if (ch.isKeySet) reply += " " + ch.key;
      if (ch.membersLimit !== -1) reply += " " + ch.membersLimit;
      if (reply !== "") reply = " +" + reply;
      this.sendReply(fd, RPL.RPL_CHANNELMODEIS, target + reply);
      return;
    }
    if (!ch.operators.has(fd)) { this.sendReply(fd, RPL.ERR_CHANOPRIVSNEEDED, target); return; }
    if (msg.params[1] === "" || (msg.params[1][0] !== "+" && msg.params[1][0] !== "-")) return;

    const modeStr = msg.params[1];
    const b: ModeBroadcast = { modes: "", args: "", unknown: "" };
    let sw = true;
    const idx = { v: 2 };
    for (let i = 0; i < modeStr.length; i++) {
      let replyCode = "";
      const arg = idx.v < msg.params.length ? msg.params[idx.v] : "";
      switch (modeStr[i]) {
        case "+": if (sw === false || b.modes === "") sw = true; break;
        case "-": if (sw === true || b.modes === "") sw = false; break;
        case "i": replyCode = ch.modeI(sw, b); break;
        case "k": replyCode = ch.modeK(sw, arg, b); idx.v++; break;
        case "l": replyCode = ch.modeL(sw, arg, idx, b); break;
        case "o": replyCode = ch.modeO(sw, arg, b); idx.v++; break;
        case "t": replyCode = ch.modeT(sw, b); break;
        default: b.unknown += modeStr[i];
      }
      if (replyCode !== "") this.sendReply(fd, replyCode);
    }
    if (b.modes !== "") {
      b.modes = cleanUpModes(b.modes);
      ch.broadcast(this.clients.get(fd)!, "MODE " + target + " " + b.modes + b.args + "\r\n");
    }
    if (b.unknown !== "") {
      this.send(fd, ":" + senderNick + " MODE " + target + " '" + b.unknown + "' :Unknown mode characters !\r\n");
    }
  }

  // ---- cmds/Privmsg.cpp ----
  private execBot(fd: number, name: string) {
    const roll = Math.floor(Math.random() * 6); // std::rand() % 6
    const art = ARTS[roll];
    for (let i = 0; art[i] !== ""; i++) {
      this.send(fd, ":artbot!artbot@localhost PRIVMSG " + name + " :" + art[i] + "\r\n");
    }
  }

  execPrivmsg(fd: number, msg: Message) {
    if (msg.params.length === 0) { this.sendReply(fd, RPL.ERR_NORECIPIENT, msg.command); return; }
    else if (msg.trailing === "") { this.sendReply(fd, RPL.ERR_NOTEXTTOSEND, msg.command); return; }
    const me = this.clients.get(fd)!;
    for (const params of getlineSplit(msg.params[0])) {
      if (params === "") continue;
      if (params[0] === "#") {
        const ch = this.channels.get(params);
        if (!ch) { this.sendReply(fd, RPL.ERR_NOSUCHNICK, params); continue; }
        if (!ch.members.has(fd)) {
          this.send(fd, ":localhost 404 " + me.nickName + " " + params + " :Cannot send to channel\r\n");
          continue;
        }
        const trigger = "!artbot";
        const keyword = msg.trailing.substring(0, trigger.length);
        const next = msg.trailing.length > trigger.length ? msg.trailing[trigger.length] : "\0";
        if (keyword === trigger && (next === " " || next === "\0")) this.execBot(fd, params);
        else ch.broadcast(me, "PRIVMSG " + params + " :" + msg.trailing + "\r\n", true);
      } else if (params[0] === "@") {
        const channelName = params.substring(1);
        const ch = this.channels.get(channelName);
        if (!ch) { this.sendReply(fd, RPL.ERR_NOSUCHNICK, channelName); continue; }
        if (!ch.operators.has(fd)) {
          this.send(fd, ":localhost 404 " + me.nickName + " " + channelName + " :Cannot send to channel\r\n");
          continue;
        }
        ch.operatorsBroadcast(me, "PRIVMSG " + params + " :" + msg.trailing + "\r\n");
      } else {
        let found = false;
        for (const [cfd, c] of byFd(this.clients)) {
          if (c.nickName === params) {
            this.send(cfd, me.getPrefix() + " PRIVMSG " + params + " :" + msg.trailing + "\r\n");
            found = true;
            break;
          }
        }
        if (!found) this.sendReply(fd, RPL.ERR_NOSUCHNICK, params);
      }
    }
  }

  // ---- cmds/Ping.cpp ----
  execPing(fd: number, msg: Message) {
    if (msg.params.length === 0) { this.sendReply(fd, RPL.ERR_NOORIGIN); return; }
    this.send(fd, "PONG :" + msg.params[0] + "\r\n");
  }

  // ---- cmds/Quit.cpp ----
  execQuit(fd: number, msg: Message) {
    const c = this.clients.get(fd)!;
    for (const [, ch] of byName(c.channels)) {
      let message = "QUIT :";
      if (msg.trailing !== "") message += msg.trailing;
      message += "\r\n";
      ch.broadcast(c, message, true);
    }
    this.send(fd, "ERROR :Closing connection\r\n");
    this.disconnectClient(fd, "QUIT");
  }
}
