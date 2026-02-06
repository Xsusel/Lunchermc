package pl.xsus.custommenu;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.api.distmarker.OnlyIn;

/**
 * Helper do łączenia z serwerem
 */
@OnlyIn(Dist.CLIENT)
public class ConnectToServerHelper {

    /**
     * Łączy klienta z serwerem
     */
    public static void connect(Minecraft mc, ServerData serverData) {
        try {
            // Parsuj adres serwera
            ServerAddress serverAddress = ServerAddress.parseString(serverData.ip);

            // Połącz używając ConnectScreen
            ConnectScreen.startConnecting(
                new TitleScreen(), // Ekran powrotny w przypadku błędu
                mc,
                serverAddress,
                serverData,
                false // quickPlay
            );

            XsusMenuMod.LOGGER.info("XsusMenuMod: Rozpoczęto łączenie z " + serverData.ip);
        } catch (Exception e) {
            XsusMenuMod.LOGGER.error("XsusMenuMod: Błąd podczas łączenia z serwerem", e);
        }
    }
}
