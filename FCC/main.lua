print('system')

print('------ list system functions')

for n in pairs(playdate.system) do print(n) end

print('------ list files ./')

for k, v in pairs(playdate.file.listFiles('/')) do print(v) end

print('------ list files ./System')

for k, v in pairs(playdate.file.listFiles('/System/')) do print(v) end

local f = playdate.file.open('/System/access_token',  playdate.file.kFileRead)

local size = playdate.file.getSize('/System/access_token')
local r = f:read(size)

print('token', r)

function playdate.update()
end