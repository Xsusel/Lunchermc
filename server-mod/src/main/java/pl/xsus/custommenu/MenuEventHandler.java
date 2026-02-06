package pl.xsus.custommenu;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.network.chat.Component;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.api.distmarker.OnlyIn;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

import java.util.ArrayList;
import java.util.List;

/**
 * Handler zdarzen ekranu - modyfikuje menu glowne
 */
@OnlyIn(Dist.CLIENT)
public class MenuEventHandler {

    @SubscribeEvent
    public void onScreenInit(ScreenEvent.Init.Post event) {
        Screen screen = event.getScreen();

        // Tylko dla ekranu tytulowego (menu glowne)
        if (!(screen instanceof TitleScreen)) {
            return;
        }

        XsusMenuMod.LOGGER.info("XsusMenuMod: Modyfikowanie menu glownego...");

        // Znajdz przyciski do usuniecia
        List<Button> buttonsToRemove = new ArrayList<>();

        for (var widget : event.getListenersList()) {
            if (widget instanceof Button button) {
                String buttonText = button.getMessage().getString().toLowerCase();

                // Usun przyciski Singleplayer, Multiplayer, Realms
                if (buttonText.contains("singleplayer") ||
                    buttonText.contains("pojedynczy") ||
                    buttonText.contains("multiplayer") ||
                    buttonText.contains("wieloosobowy") ||
                    buttonText.contains("realms") ||
                    buttonText.contains("minecraft realms")) {
                    buttonsToRemove.add(button);
                }
            }
        }

        // Usun znalezione przyciski
        for (Button button : buttonsToRemove) {
            event.removeListener(button);
        }

        // Dodaj przycisk "Graj na serwerze" - wiekszy i bardziej widoczny
        int centerX = screen.width / 2;
        int buttonWidth = 240;
        int buttonHeight = 20;
        int buttonY = screen.height / 4 + 48;

        String buttonText = "\u25B6 Graj na " + XsusMenuMod.SERVER_NAME;

        Button connectButton = Button.builder(
            Component.literal(buttonText),
            btn -> connectToServer()
        )
        .bounds(centerX - buttonWidth / 2, buttonY, buttonWidth, buttonHeight)
        .build();

        event.addListener(connectButton);

        XsusMenuMod.LOGGER.info("XsusMenuMod: Menu zmodyfikowane pomyslnie! Serwer: {}:{}",
            XsusMenuMod.SERVER_IP, XsusMenuMod.SERVER_PORT);
    }

    @SubscribeEvent
    public void onScreenRender(ScreenEvent.Render.Post event) {
        Screen screen = event.getScreen();

        if (!(screen instanceof TitleScreen)) {
            return;
        }

        GuiGraphics guiGraphics = event.getGuiGraphics();
        int centerX = screen.width / 2;

        // Rysuj informacje o serwerze pod przyciskiem
        String serverInfo = XsusMenuMod.SERVER_IP + ":" + XsusMenuMod.SERVER_PORT;
        int infoY = screen.height / 4 + 48 + 24;

        guiGraphics.drawCenteredString(
            Minecraft.getInstance().font,
            Component.literal("\u00A77" + serverInfo),
            centerX,
            infoY,
            0xAAAAAA
        );
    }

    /**
     * Laczy z serwerem (IP pobrane z konfiguracji panelu)
     */
    private void connectToServer() {
        Minecraft mc = Minecraft.getInstance();

        String serverAddress = XsusMenuMod.SERVER_IP + ":" + XsusMenuMod.SERVER_PORT;

        XsusMenuMod.LOGGER.info("XsusMenuMod: Laczenie z serwerem: " + serverAddress);

        // Utworz dane serwera
        ServerData serverData = new ServerData(
            XsusMenuMod.SERVER_NAME,
            serverAddress,
            ServerData.Type.OTHER
        );

        // Polacz z serwerem
        ConnectToServerHelper.connect(mc, serverData);
    }
}
