package pl.xsus.custommenu;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.fml.loading.FMLPaths;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * XsusMenuMod - Modyfikuje menu główne Minecraft
 * Usuwa przyciski Singleplayer/Multiplayer i dodaje "Połącz z serwerem"
 * IP serwera pobierane z pliku konfiguracyjnego zapisanego przez launcher
 */
@Mod(XsusMenuMod.MOD_ID)
public class XsusMenuMod {
    public static final String MOD_ID = "xsusmenu";
    public static final Logger LOGGER = LogManager.getLogger();

    // Konfiguracja serwera - wczytywana z pliku xsus_server.json
    public static String SERVER_IP = "play.xsus.pl";
    public static int SERVER_PORT = 25565;
    public static String SERVER_NAME = "XsusServer";

    public XsusMenuMod() {
        // Wczytaj konfigurację serwera z pliku
        loadServerConfig();

        FMLJavaModLoadingContext.get().getModEventBus().addListener(this::clientSetup);
    }

    /**
     * Wczytuje konfigurację serwera z pliku JSON utworzonego przez launcher
     * Plik: .minecraft/xsus_server.json
     */
    private void loadServerConfig() {
        try {
            Path configPath = FMLPaths.GAMEDIR.get().resolve("xsus_server.json");

            if (Files.exists(configPath)) {
                String content = Files.readString(configPath);
                Gson gson = new Gson();
                JsonObject config = gson.fromJson(content, JsonObject.class);

                if (config.has("serverIp")) {
                    SERVER_IP = config.get("serverIp").getAsString();
                }
                if (config.has("serverPort")) {
                    SERVER_PORT = config.get("serverPort").getAsInt();
                }
                if (config.has("serverName")) {
                    SERVER_NAME = config.get("serverName").getAsString();
                }

                LOGGER.info("XsusMenuMod: Wczytano konfigurację serwera: {}:{}", SERVER_IP, SERVER_PORT);
            } else {
                LOGGER.warn("XsusMenuMod: Brak pliku konfiguracyjnego xsus_server.json, używam domyślnych wartości");
            }
        } catch (IOException e) {
            LOGGER.error("XsusMenuMod: Błąd wczytywania konfiguracji serwera", e);
        }
    }

    private void clientSetup(final FMLClientSetupEvent event) {
        LOGGER.info("XsusMenuMod: Rejestrowanie handlera menu...");
        MinecraftForge.EVENT_BUS.register(new MenuEventHandler());
    }
}
